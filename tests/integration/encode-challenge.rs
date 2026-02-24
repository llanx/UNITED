// Standalone Rust program to encode a ChallengeResponse protobuf message
// and write the bytes to a file for cross-language round-trip verification.
//
// Run: cargo run --manifest-path tests/integration/Cargo.toml
// Output: tests/integration/challenge_response.bin

use prost::Message;
use std::fs;

// Include the generated proto types
pub mod united {
    pub mod auth {
        include!(concat!(env!("OUT_DIR"), "/united.auth.rs"));
    }
}

fn main() {
    let response = united::auth::ChallengeResponse {
        challenge_id: "test-challenge-001".to_string(),
        challenge_bytes: vec![
            0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
            0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
            0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
            0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
        ],
    };

    let mut buf = Vec::new();
    response.encode(&mut buf).expect("Failed to encode protobuf");

    let out_path = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "challenge_response.bin".to_string());

    fs::write(&out_path, &buf).expect("Failed to write file");
    println!("Encoded ChallengeResponse ({} bytes) -> {}", buf.len(), out_path);
    println!("  challenge_id: {}", response.challenge_id);
    println!("  challenge_bytes: {} bytes", response.challenge_bytes.len());
}
