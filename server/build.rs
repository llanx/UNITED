use std::io::Result;

fn main() -> Result<()> {
    let proto_files = &[
        "../shared/proto/auth.proto",
        "../shared/proto/identity.proto",
        "../shared/proto/server.proto",
        "../shared/proto/channels.proto",
        "../shared/proto/roles.proto",
        "../shared/proto/moderation.proto",
        "../shared/proto/invite.proto",
        "../shared/proto/p2p.proto",
        "../shared/proto/ws.proto",
    ];

    let includes = &["../shared/proto"];

    prost_build::compile_protos(proto_files, includes)?;

    // Recompile if any proto file changes
    for proto in proto_files {
        println!("cargo:rerun-if-changed={}", proto);
    }

    Ok(())
}
