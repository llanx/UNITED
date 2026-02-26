use futures_util::StreamExt;
use libp2p::{
    autonat, gossipsub, identify, identity, noise, yamux, Multiaddr, PeerId, Swarm, SwarmBuilder,
};
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot};

use super::behaviour::{build_behaviour, UnitedBehaviour, UnitedBehaviourEvent};
use super::config::P2pConfig;
use super::directory::PeerDirectory;

/// Commands sent from axum handlers to the Swarm event loop.
pub enum SwarmCommand {
    /// Subscribe the server's gossipsub to a channel topic.
    SubscribeTopic(String),
    /// Unsubscribe from a channel topic.
    UnsubscribeTopic(String),
    /// Publish data to a gossipsub topic.
    Publish { topic: String, data: Vec<u8> },
    /// Query peer info for all connected peers.
    GetPeerInfo(oneshot::Sender<Vec<PeerInfoEntry>>),
    /// Query peers subscribed to a specific topic.
    GetTopicPeers {
        topic: String,
        reply: oneshot::Sender<Vec<PeerId>>,
    },
}

/// Events emitted from the Swarm event loop to the message handler task.
pub enum SwarmEvent {
    /// Received a gossipsub message.
    GossipMessage {
        source: PeerId,
        topic: String,
        data: Vec<u8>,
    },
    /// A new peer connected.
    PeerConnected(PeerId),
    /// A peer disconnected.
    PeerDisconnected(PeerId),
}

/// Peer info returned from GetPeerInfo command.
#[derive(Debug, Clone)]
pub struct PeerInfoEntry {
    pub peer_id: PeerId,
    pub multiaddrs: Vec<Multiaddr>,
}

/// Build the libp2p Swarm with the UNITED composed behaviour.
pub async fn build_swarm(
    keypair: identity::Keypair,
    config: &P2pConfig,
    topic_hashes: &[gossipsub::TopicHash],
) -> Swarm<UnitedBehaviour> {
    let config_clone = config.clone();
    let topics = topic_hashes.to_vec();

    SwarmBuilder::with_existing_identity(keypair)
        .with_tokio()
        .with_tcp(
            Default::default(),
            noise::Config::new,
            yamux::Config::default,
        )
        .expect("TCP transport")
        .with_websocket(noise::Config::new, yamux::Config::default)
        .await
        .expect("WebSocket transport")
        .with_behaviour(|key| {
            build_behaviour(key, &config_clone, &topics)
        })
        .expect("Behaviour")
        .build()
}

/// Run the Swarm event loop.
///
/// This function is spawned as a tokio task and processes:
/// - Swarm events (gossipsub messages, peer connections, identify, relay)
/// - Commands from axum handlers (subscribe, publish, query)
///
/// Communication with the rest of the application happens via mpsc channels.
pub async fn run_swarm_loop(
    mut swarm: Swarm<UnitedBehaviour>,
    mut cmd_rx: mpsc::UnboundedReceiver<SwarmCommand>,
    evt_tx: mpsc::UnboundedSender<SwarmEvent>,
    peer_directory: Arc<PeerDirectory>,
    listen_addr: Multiaddr,
) {
    // Start listening
    match swarm.listen_on(listen_addr.clone()) {
        Ok(_) => tracing::info!("libp2p Swarm listening on {}", listen_addr),
        Err(e) => {
            tracing::error!("Failed to listen on {}: {}", listen_addr, e);
            return;
        }
    }

    loop {
        tokio::select! {
            event = swarm.select_next_some() => {
                handle_swarm_event(event, &evt_tx, &peer_directory);
            }
            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(cmd) => handle_swarm_command(&mut swarm, cmd),
                    None => {
                        tracing::info!("Swarm command channel closed, shutting down");
                        break;
                    }
                }
            }
        }
    }
}

/// Handle a SwarmEvent from the libp2p Swarm.
fn handle_swarm_event(
    event: libp2p::swarm::SwarmEvent<UnitedBehaviourEvent>,
    evt_tx: &mpsc::UnboundedSender<SwarmEvent>,
    peer_directory: &PeerDirectory,
) {
    use libp2p::swarm::SwarmEvent as LibSwarmEvent;

    match event {
        LibSwarmEvent::Behaviour(behaviour_event) => {
            handle_behaviour_event(behaviour_event, evt_tx, peer_directory);
        }
        LibSwarmEvent::ConnectionEstablished {
            peer_id, endpoint, ..
        } => {
            tracing::debug!("Connection established: {} via {:?}", peer_id, endpoint);
            let _ = evt_tx.send(SwarmEvent::PeerConnected(peer_id));
        }
        LibSwarmEvent::ConnectionClosed { peer_id, .. } => {
            tracing::debug!("Connection closed: {}", peer_id);
            peer_directory.unregister_peer(&peer_id);
            let _ = evt_tx.send(SwarmEvent::PeerDisconnected(peer_id));
        }
        LibSwarmEvent::NewListenAddr { address, .. } => {
            tracing::info!("libp2p listening on: {}", address);
        }
        _ => {}
    }
}

/// Handle a behaviour-level event.
fn handle_behaviour_event(
    event: UnitedBehaviourEvent,
    evt_tx: &mpsc::UnboundedSender<SwarmEvent>,
    peer_directory: &PeerDirectory,
) {
    match event {
        UnitedBehaviourEvent::Gossipsub(gossipsub::Event::Message {
            propagation_source,
            message,
            ..
        }) => {
            let topic = message.topic.to_string();
            tracing::debug!(
                "Gossipsub message from {} on topic {}",
                propagation_source,
                topic
            );
            let _ = evt_tx.send(SwarmEvent::GossipMessage {
                source: propagation_source,
                topic,
                data: message.data,
            });
        }
        UnitedBehaviourEvent::Gossipsub(gossipsub::Event::Subscribed { peer_id, topic }) => {
            tracing::debug!("Peer {} subscribed to {}", peer_id, topic);
            peer_directory.add_channel(&peer_id, &topic.to_string());
        }
        UnitedBehaviourEvent::Gossipsub(gossipsub::Event::Unsubscribed { peer_id, topic }) => {
            tracing::debug!("Peer {} unsubscribed from {}", peer_id, topic);
            peer_directory.remove_channel(&peer_id, &topic.to_string());
        }
        UnitedBehaviourEvent::Identify(identify::Event::Received {
            peer_id,
            info,
            ..
        }) => {
            tracing::debug!(
                "Identify: {} has {} listen addrs, protocols: {:?}",
                peer_id,
                info.listen_addrs.len(),
                info.protocols.iter().take(3).collect::<Vec<_>>()
            );
            peer_directory.update_multiaddrs(&peer_id, info.listen_addrs);
        }
        UnitedBehaviourEvent::Autonat(autonat::Event::StatusChanged { old, new }) => {
            tracing::info!("AutoNAT status changed: {:?} -> {:?}", old, new);
        }
        UnitedBehaviourEvent::Relay(event) => {
            tracing::debug!("Relay event: {:?}", event);
        }
        _ => {}
    }
}

/// Handle a command from axum handlers.
fn handle_swarm_command(swarm: &mut Swarm<UnitedBehaviour>, cmd: SwarmCommand) {
    match cmd {
        SwarmCommand::SubscribeTopic(topic_str) => {
            let topic = gossipsub::IdentTopic::new(&topic_str);
            match swarm.behaviour_mut().gossipsub.subscribe(&topic) {
                Ok(true) => tracing::info!("Subscribed to gossipsub topic: {}", topic_str),
                Ok(false) => {
                    tracing::debug!("Already subscribed to topic: {}", topic_str)
                }
                Err(e) => tracing::error!("Failed to subscribe to {}: {:?}", topic_str, e),
            }
        }
        SwarmCommand::UnsubscribeTopic(topic_str) => {
            let topic = gossipsub::IdentTopic::new(&topic_str);
            if swarm.behaviour_mut().gossipsub.unsubscribe(&topic) {
                tracing::info!("Unsubscribed from gossipsub topic: {}", topic_str);
            } else {
                tracing::debug!("Was not subscribed to topic: {}", topic_str);
            }
        }
        SwarmCommand::Publish { topic, data } => {
            let gossip_topic = gossipsub::IdentTopic::new(&topic);
            match swarm
                .behaviour_mut()
                .gossipsub
                .publish(gossip_topic, data)
            {
                Ok(msg_id) => {
                    tracing::debug!("Published to {}, message_id: {:?}", topic, msg_id)
                }
                Err(e) => tracing::error!("Failed to publish to {}: {:?}", topic, e),
            }
        }
        SwarmCommand::GetPeerInfo(reply) => {
            let peers: Vec<PeerInfoEntry> = swarm
                .connected_peers()
                .map(|peer_id| {
                    let addrs: Vec<Multiaddr> = swarm
                        .external_addresses()
                        .cloned()
                        .collect();
                    PeerInfoEntry {
                        peer_id: *peer_id,
                        multiaddrs: addrs,
                    }
                })
                .collect();
            let _ = reply.send(peers);
        }
        SwarmCommand::GetTopicPeers { topic, reply } => {
            let topic_hash = gossipsub::IdentTopic::new(&topic).hash();
            let peers: Vec<PeerId> = swarm
                .behaviour()
                .gossipsub
                .mesh_peers(&topic_hash)
                .cloned()
                .collect();
            let _ = reply.send(peers);
        }
    }
}
