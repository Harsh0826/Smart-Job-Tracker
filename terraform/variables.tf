variable "aws_region" {
  description = "AWS region for infrastructure"
  type        = string
  default     = "ca-central-1"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "smart-job-tracker"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

variable "resume_bucket_name" {
  description = "Unique S3 bucket name"
  type        = string
}

variable "frontend_allowed_origins" {
  description = "Allowed frontend origins for browser uploads to S3"
  type        = list(string)
  default     = ["http://localhost:5173"]
}
