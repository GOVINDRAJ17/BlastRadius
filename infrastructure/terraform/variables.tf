variable "aws_region" {
  type        = string
  description = "AWS region for deployment"
  default     = "us-east-1"
}

variable "environment" {
  type        = string
  description = "Deployment environment name"
  default     = "production"
}

variable "project_name" {
  type        = string
  description = "Project name prefix"
  default     = "blastradius"
}

variable "services" {
  type        = list(string)
  description = "List of microservices in the monorepo"
  default     = ["auth", "notifications", "payments", "search", "shared"]
}

variable "api_desired_count" {
  type        = number
  description = "Desired count of API Fargate tasks"
  default     = 2
}

variable "api_cpu" {
  type        = number
  description = "Fargate CPU units for API task"
  default     = 256
}

variable "api_memory" {
  type        = number
  description = "Fargate memory (MB) for API task"
  default     = 512
}

variable "report_api_secret" {
  type        = string
  description = "Bearer token secret for POST /api/reports ingestion"
  sensitive   = true
  default     = "blastradius_report_secret_default_9f8e7d"
}
