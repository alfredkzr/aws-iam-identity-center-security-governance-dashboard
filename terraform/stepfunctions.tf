# -----------------------------------------------------------------------------
# Step Functions — IAM Identity Center Crawler
# -----------------------------------------------------------------------------

resource "aws_sfn_state_machine" "crawler" {
  name     = "${var.resource_prefix}-crawler"
  role_arn = aws_iam_role.step_functions.arn
  type     = "STANDARD"

  definition = jsonencode({
    Comment = "Crawl all AWS accounts for IAM Identity Center assignments"
    StartAt = "ListAccounts"
    States = {
      ListAccounts = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = aws_lambda_function.worker.arn
          Payload = {
            action = "list_accounts"
          }
        }
        ResultPath = "$.accounts_result"
        ResultSelector = {
          "accounts.$" = "$.Payload.accounts"
        }
        Next = "CrawlAccounts"
      }

      CrawlAccounts = {
        Type = "Map"
        ItemsPath = "$.accounts_result.accounts"
        ItemProcessor = {
          ProcessorConfig = {
            Mode          = "DISTRIBUTED"
            ExecutionType = "STANDARD"
          }
          StartAt = "ProcessAccount"
          States = {
            ProcessAccount = {
              Type     = "Task"
              Resource = "arn:aws:states:::lambda:invoke"
              Parameters = {
                FunctionName = aws_lambda_function.worker.arn
                Payload = {
                  action     = "process_account"
                  "account.$" = "$"
                }
              }
              ResultSelector = {
                "status.$"     = "$.Payload.status"
                "account_id.$" = "$.Payload.account_id"
                "count.$"      = "$.Payload.assignment_count"
              }
              End = true
            }
          }
        }
        MaxConcurrency = 10
        ResultPath     = "$.map_results"
        Next           = "CrawlPermissionSets"
      }

      CrawlPermissionSets = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = aws_lambda_function.worker.arn
          Payload = {
            action = "crawl_permission_sets"
          }
        }
        ResultPath = "$.permission_sets_result"
        ResultSelector = {
          "status.$"               = "$.Payload.status"
          "permission_set_count.$" = "$.Payload.permission_set_count"
        }
        Next = "CrawlComplete"
      }

      CrawlComplete = {
        Type = "Succeed"
        Comment = "All accounts and permission sets processed successfully"
      }
    }
  })
}
