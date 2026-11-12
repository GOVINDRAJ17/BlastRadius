output "alb_dns_name" {
  description = "Public DNS hostname of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "ecs_cluster_name" {
  description = "Name of the created ECS Cluster"
  value       = aws_ecs_cluster.main.name
}

output "api_service_name" {
  description = "Name of the API ECS Service"
  value       = aws_ecs_service.api.name
}

output "ecr_api_repository_url" {
  description = "ECR repository URL for the Central API"
  value       = aws_ecr_repository.api.repository_url
}

output "ecr_service_repository_urls" {
  description = "Map of microservice names to ECR repository URLs"
  value       = { for k, v in aws_ecr_repository.services : k => v.repository_url }
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint address"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

