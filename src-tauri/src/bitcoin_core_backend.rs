#[derive(Debug, Clone)]
pub struct BitcoinCoreRpcConfig {
    pub url: String,
    pub wallet: Option<String>,
}

pub fn is_local_rpc_url(url: &str) -> bool {
    url.starts_with("http://127.0.0.1")
        || url.starts_with("http://localhost")
        || url.starts_with("http://[::1]")
}
