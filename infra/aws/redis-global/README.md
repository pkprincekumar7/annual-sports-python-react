# AWS Redis Global Datastore

This stack creates a Redis Global Datastore with a primary region and optional
secondary regions. Use the outputs as the `redis_endpoint_override` in regional
ECS backend stacks.

## Prerequisites
- Terraform 1.13+
- Existing VPCs, private subnets, and ECS tasks security groups in each region

## Example tfvars
```hcl
primary_region = "us-east-1"
app_prefix     = "as"
env            = "dev"

primary_vpc_id      = "vpc-xxxx"
primary_subnet_ids  = ["subnet-a", "subnet-b"]
primary_ecs_sg_id   = "sg-ecs-tasks"

enable_eu_west_1    = true
eu_west_1_vpc_id    = "vpc-xxxx"
eu_west_1_subnet_ids = ["subnet-a", "subnet-b"]
eu_west_1_ecs_sg_id  = "sg-ecs-tasks"

enable_ap_southeast_1 = true
ap_southeast_1_vpc_id = "vpc-xxxx"
ap_southeast_1_subnet_ids = ["subnet-a", "subnet-b"]
ap_southeast_1_ecs_sg_id  = "sg-ecs-tasks"

redis_node_type = "cache.t4g.small"
redis_num_cache_nodes = 1
redis_transit_encryption_enabled = true
redis_at_rest_encryption_enabled = true
redis_auth_token = "replace-with-strong-token"
```

## Notes
- `primary_region` is fixed to `us-east-1` in this stack.
- Ensure the `redis_auth_token` matches the value stored in Secrets Manager for
  `redis_auth_token` in each regional ECS stack.
- If `redis_transit_encryption_enabled = true`, `redis_auth_token` must be set.
- If you disable a secondary region, set its `enable_*` flag to `false` and
  leave the related VPC/subnet/SG variables empty.

## Outputs Used by Other Stacks
- Use `primary_endpoint`, `eu_west_1_endpoint`, `ap_southeast_1_endpoint` as
  `redis_endpoint_override` in regional `ecs-backend` stacks.
