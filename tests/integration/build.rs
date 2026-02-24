use std::io::Result;

fn main() -> Result<()> {
    // Only compile auth.proto for this test binary
    prost_build::compile_protos(
        &["../../shared/proto/auth.proto"],
        &["../../shared/proto"],
    )?;

    println!("cargo:rerun-if-changed=../../shared/proto/auth.proto");
    Ok(())
}
