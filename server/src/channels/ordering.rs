/// Gap between position values for ordered items.
/// Using a large gap allows efficient insertions between items without renumbering.
pub const POSITION_GAP: i64 = 1000;

/// Calculate the next position after the current maximum.
pub fn next_position(max_current: i64) -> i64 {
    max_current + POSITION_GAP
}
