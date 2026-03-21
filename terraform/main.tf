provider "aws" {
  region = var.aws_region
}
locals {
  common_tags={
    Project = var.project_name
    Environment = var.environment
    ManagedBy = "Terraform" 
  }
}
resource "aws_s3_bucket" "resume_uploads" {
  bucket = var.resume_bucket_name
  tags = merge(local.common_tags,{
    Name = var.resume_bucket_name
  })
}
resource "aws_s3_bucket_public_access_block" "resume_uploads" {
  bucket = aws_s3_bucket.resume_uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "resume_uploads" {
  bucket = aws_s3_bucket.resume_uploads.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = var.frontend_allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}