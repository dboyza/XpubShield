use crate::models::BackendKind;

#[derive(Debug, Clone)]
pub struct EsploraBackendConfig {
    pub base_url: String,
    pub use_tor: bool,
}

pub fn backend_kind_for_config(config: &EsploraBackendConfig) -> BackendKind {
    if config.base_url.contains("mempool.space") && !config.use_tor {
        BackendKind::PublicEsplora
    } else {
        BackendKind::Esplora
    }
}
