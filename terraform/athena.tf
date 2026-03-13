# -----------------------------------------------------------------------------
# Athena — Workgroup & Table Schema (No Glue Crawlers)
# -----------------------------------------------------------------------------

resource "aws_athena_workgroup" "main" {
  name          = "${var.resource_prefix}-workgroup"
  force_destroy = true

  configuration {
    enforce_workgroup_configuration = true

    result_configuration {
      output_location = "s3://${aws_s3_bucket.athena_results.id}/query-results/"
    }
  }
}

# Glue Database (required for Athena table)
resource "aws_glue_catalog_database" "main" {
  name = "${replace(var.resource_prefix, "-", "_")}_db"
}

# Glue Table (manual schema — no Glue Crawlers)
resource "aws_glue_catalog_table" "assignments" {
  name          = "assignments"
  database_name = aws_glue_catalog_database.main.name

  table_type = "EXTERNAL_TABLE"

  parameters = {
    "classification"  = "csv"
    "skip.header.line.count" = "1"
    "projection.enabled" = "true"
    "projection.snapshot_date.type" = "date"
    "projection.snapshot_date.format" = "yyyy-MM-dd"
    "projection.snapshot_date.range" = "2024-01-01,NOW"
    "projection.snapshot_date.interval" = "1"
    "projection.snapshot_date.interval.unit" = "DAYS"
    "storage.location.template" = "s3://${aws_s3_bucket.inventory.id}/assignments/snapshot_date=$${snapshot_date}/"
  }

  partition_keys {
    name = "snapshot_date"
    type = "string"
  }

  storage_descriptor {
    location      = "s3://${aws_s3_bucket.inventory.id}/assignments/"
    input_format  = "org.apache.hadoop.mapred.TextInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat"

    ser_de_info {
      serialization_library = "org.apache.hadoop.hive.serde2.OpenCSVSerde"

      parameters = {
        "separatorChar" = ","
        "quoteChar"     = "\""
      }
    }

    columns {
      name = "account_id"
      type = "string"
    }

    columns {
      name = "account_name"
      type = "string"
    }

    columns {
      name = "principal_type"
      type = "string"
    }

    columns {
      name = "principal_id"
      type = "string"
    }

    columns {
      name = "principal_name"
      type = "string"
    }

    columns {
      name = "principal_email"
      type = "string"
    }

    columns {
      name = "permission_set_name"
      type = "string"
    }

    columns {
      name = "permission_set_arn"
      type = "string"
    }

    columns {
      name = "group_name"
      type = "string"
    }

    columns {
      name = "created_date"
      type = "string"
    }
  }
}

# Glue Table — Permission Sets (JSON SerDe)
resource "aws_glue_catalog_table" "permission_sets" {
  name          = "permission_sets"
  database_name = aws_glue_catalog_database.main.name

  table_type = "EXTERNAL_TABLE"

  parameters = {
    "classification"                        = "json"
    "projection.enabled"                    = "true"
    "projection.snapshot_date.type"         = "date"
    "projection.snapshot_date.format"       = "yyyy-MM-dd"
    "projection.snapshot_date.range"        = "2024-01-01,NOW"
    "projection.snapshot_date.interval"     = "1"
    "projection.snapshot_date.interval.unit" = "DAYS"
    "storage.location.template"            = "s3://${aws_s3_bucket.inventory.id}/permission_sets/snapshot_date=$${snapshot_date}/"
  }

  partition_keys {
    name = "snapshot_date"
    type = "string"
  }

  storage_descriptor {
    location      = "s3://${aws_s3_bucket.inventory.id}/permission_sets/"
    input_format  = "org.apache.hadoop.mapred.TextInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat"

    ser_de_info {
      serialization_library = "org.openx.data.jsonserde.JsonSerDe"

      parameters = {
        "dots.in.keys" = "false"
        "case.insensitive" = "true"
      }
    }

    columns {
      name = "name"
      type = "string"
    }

    columns {
      name = "arn"
      type = "string"
    }

    columns {
      name = "description"
      type = "string"
    }

    columns {
      name = "session_duration"
      type = "string"
    }

    columns {
      name = "created_date"
      type = "string"
    }

    columns {
      name = "aws_managed_policies"
      type = "array<struct<name:string,arn:string>>"
    }

    columns {
      name = "customer_managed_policies"
      type = "array<struct<name:string,path:string>>"
    }

    columns {
      name = "inline_policy"
      type = "string"
    }

    columns {
      name = "permissions_boundary"
      type = "struct<managed_policy_arn:string,customer_managed_policy_reference:struct<name:string,path:string>>"
    }

    columns {
      name = "tags"
      type = "array<struct<key:string,value:string>>"
    }

    columns {
      name = "provisioned_accounts"
      type = "int"
    }
  }
}

# Named query for quick reference
resource "aws_athena_named_query" "all_assignments" {
  name      = "${var.resource_prefix}-all-assignments"
  workgroup = aws_athena_workgroup.main.name
  database  = aws_glue_catalog_database.main.name

  query = <<-EOQ
    SELECT
      account_id,
      account_name,
      principal_type,
      principal_name,
      principal_email,
      permission_set_name,
      permission_set_arn,
      created_date
    FROM assignments
    ORDER BY account_name, principal_name
  EOQ
}

resource "aws_athena_named_query" "summary_by_account" {
  name      = "${var.resource_prefix}-summary-by-account"
  workgroup = aws_athena_workgroup.main.name
  database  = aws_glue_catalog_database.main.name

  query = <<-EOQ
    SELECT
      account_id,
      account_name,
      COUNT(*) as total_assignments,
      COUNT(DISTINCT principal_name) as unique_principals,
      COUNT(DISTINCT permission_set_name) as unique_permission_sets
    FROM assignments
    GROUP BY account_id, account_name
    ORDER BY total_assignments DESC
  EOQ
}
