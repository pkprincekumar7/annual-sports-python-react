output "cluster_name" {
  value       = google_container_cluster.gke.name
  description = "GKE cluster name."
}

output "cluster_endpoint" {
  value       = google_container_cluster.gke.endpoint
  description = "GKE cluster endpoint."
}

output "artifact_registry_repo" {
  value       = google_artifact_registry_repository.docker.repository_id
  description = "Artifact Registry repository ID."
}

output "redis_host" {
  value       = google_redis_instance.redis.host
  description = "Memorystore Redis host."
}

output "ingress_ip" {
  value       = google_compute_address.ingress.address
  description = "Ingress public IP."
}
