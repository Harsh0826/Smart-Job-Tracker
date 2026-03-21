output "aws_region" {
    description = "AWS region used for Deployment"
  value = var.aws_region
}
output "resume_bucket_name" {
    description = "Name of the S3 bucket for resume uploads"
    value = aws_s3_bucket.resume_uploads.bucket
}
output "resume_bucket_arm" {
  description = "S3 bucket ARN for resume uploads"
  value = aws_s3_bucket.resume_uploads.arn
}