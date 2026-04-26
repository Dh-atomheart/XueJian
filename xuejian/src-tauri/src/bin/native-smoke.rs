#[tokio::main(flavor = "multi_thread", worker_threads = 4)]
async fn main() {
    let report_path = app_lib::native_smoke::run().await;
    println!("native smoke report written to {}", report_path.display());
}
