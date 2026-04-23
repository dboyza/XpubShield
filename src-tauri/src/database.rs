use rusqlite::{Connection, Result};
use std::path::Path;

pub const INITIAL_SCHEMA: &str = include_str!("../migrations/001_initial_schema.sql");

pub fn initialize_database(path: impl AsRef<Path>) -> Result<Connection> {
    let connection = Connection::open(path)?;
    connection.execute_batch(INITIAL_SCHEMA)?;
    Ok(connection)
}

pub fn initialize_memory_database() -> Result<Connection> {
    let connection = Connection::open_in_memory()?;
    connection.execute_batch(INITIAL_SCHEMA)?;
    Ok(connection)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_creates_phase_one_tables() {
        let connection = initialize_memory_database().unwrap();
        let count: u32 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('wallets', 'utxos', 'audit_findings', 'settings')",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(count, 4);
    }
}
