/**
 * Protobuf round-trip test: Rust encodes -> TypeScript decodes
 *
 * Validates cross-language protobuf compatibility between prost (Rust)
 * and @bufbuild/protobuf (TypeScript).
 *
 * See 01-RESEARCH.md Pitfall 7 and Pitfall 8.
 *
 * Usage: npx tsx proto-roundtrip.ts  (from tests/integration/)
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChallengeResponseSchema } from '../../shared/types/generated/auth_pb.ts';
import { fromBinary, toBinary, create } from '@bufbuild/protobuf';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EXPECTED_CHALLENGE_ID = 'test-challenge-001';
const EXPECTED_CHALLENGE_BYTES = new Uint8Array([
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
  0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
  0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
]);

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function main() {
  console.log('=== Protobuf Round-Trip Test ===\n');

  // --- Test 1: Decode Rust-encoded bytes ---
  console.log('Test 1: Decode Rust-encoded ChallengeResponse');

  const binPath = join(__dirname, 'challenge_response.bin');
  console.log(`  Reading: ${binPath}`);

  let bytes: Uint8Array;
  try {
    bytes = readFileSync(binPath);
  } catch {
    console.error(`  FAIL: Could not read ${binPath}`);
    console.error('  Run the Rust encoder first:');
    console.error('    cargo run --manifest-path tests/integration/Cargo.toml -- tests/integration/challenge_response.bin');
    process.exit(1);
  }

  console.log(`  Read ${bytes.length} bytes`);

  const decoded = fromBinary(ChallengeResponseSchema, bytes);

  console.log(`  challenge_id: "${decoded.challengeId}"`);
  console.log(`  challenge_bytes: ${decoded.challengeBytes.length} bytes`);

  let passed = true;

  if (decoded.challengeId !== EXPECTED_CHALLENGE_ID) {
    console.error(`  FAIL: challenge_id mismatch`);
    console.error(`    expected: "${EXPECTED_CHALLENGE_ID}"`);
    console.error(`    got:      "${decoded.challengeId}"`);
    passed = false;
  } else {
    console.log('  PASS: challenge_id matches');
  }

  if (!arraysEqual(decoded.challengeBytes, EXPECTED_CHALLENGE_BYTES)) {
    console.error(`  FAIL: challenge_bytes mismatch`);
    console.error(`    expected length: ${EXPECTED_CHALLENGE_BYTES.length}`);
    console.error(`    got length:      ${decoded.challengeBytes.length}`);
    passed = false;
  } else {
    console.log('  PASS: challenge_bytes matches (32 bytes)');
  }

  // --- Test 2: TypeScript encode -> decode round-trip ---
  console.log('\nTest 2: TypeScript encode -> decode round-trip');

  const original = create(ChallengeResponseSchema, {
    challengeId: 'ts-roundtrip-test',
    challengeBytes: new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]),
  });

  const encoded = toBinary(ChallengeResponseSchema, original);
  const roundTripped = fromBinary(ChallengeResponseSchema, encoded);

  if (roundTripped.challengeId !== 'ts-roundtrip-test') {
    console.error('  FAIL: TS round-trip challenge_id mismatch');
    passed = false;
  } else {
    console.log('  PASS: TS round-trip challenge_id matches');
  }

  if (!arraysEqual(roundTripped.challengeBytes, new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]))) {
    console.error('  FAIL: TS round-trip challenge_bytes mismatch');
    passed = false;
  } else {
    console.log('  PASS: TS round-trip challenge_bytes matches');
  }

  // --- Summary ---
  console.log('');
  if (passed) {
    console.log('=== ALL TESTS PASSED ===');
    console.log('Rust (prost) <-> TypeScript (@bufbuild/protobuf) round-trip verified!');
  } else {
    console.error('=== TESTS FAILED ===');
    process.exit(1);
  }
}

main();
