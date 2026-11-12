output "alb_dns_name" {
  description = "Public DNS hostname of the Application Load Balancer"
  value       = try(aws_lb.main[0].dns_name, null)
}

output "ecs_cluster_name" {
  description = "Name of the created ECS Cluster"
  value       = try(aws_ecs_cluster.main[0].name, null)
}

output "api_service_name" {
  description = "Name of the API ECS Service"
  value       = try(aws_ecs_service.api[0].name, null)
}

output "ecr_api_repository_url" {
  description = "ECR repository URL for the Central API"
  value       = try(aws_ecr_repository.api[0].repository_url, null)
}

output "ecr_service_repository_urls" {
  description = "Map of microservice names to ECR repository URLs"
  value       = { for k, v in aws_ecr_repository.services : k => v.repository_url }
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint address"
  value       = try(aws_elasticache_cluster.redis[0].cache_nodes[0].address, null)
}
