output "frontend_url" {
  value       = google_cloud_run_v2_service.frontend.uri
  description = "Frontend Cloud Run URL."
}

output "api_gateway_url" {
  value       = google_cloud_run_v2_service.api_gateway.uri
  description = "API gateway Cloud Run URL."
}

output "artifact_registry_repo" {
  value       = google_artifact_registry_repository.docker.repository_id
  description = "Artifact Registry repository ID."
}

output "redis_host" {
  value       = google_redis_instance.redis.host
  description = "Memorystore Redis host."
}
