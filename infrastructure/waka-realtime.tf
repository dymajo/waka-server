variable "realtime_regions" {
  description = "Map of Realtime Regions to Replicas for Region"
  default = {
    "au-syd" = 0
    "nz-akl" = 1
    "nz-chc" = 1
    "nz-wlg" = 1
  }
}

resource "aws_iam_user" "waka-realtime" {
  name = "waka-realtime-${var.environment}"
  path = "/digital-ocean/${data.aws_region.current.name}/"
}

resource "aws_iam_user_policy" "waka-realtime" {
  name   = "dynamo"
  user   = aws_iam_user.waka-realtime.name
  policy = data.aws_iam_policy_document.waka-realtime.json
}

data "aws_iam_policy_document" "waka-realtime" {
  statement {
    sid = "DynamoAccess"

    actions = [
      "dynamodb:GetItem",
    ]

    resources = [
      aws_dynamodb_table.waka-meta.arn
    ]
  }
}

resource "aws_iam_access_key" "waka-realtime" {
  user = aws_iam_user.waka-realtime.name
}

resource "kubernetes_secret" "waka-realtime" {
  metadata {
    name      = "waka-realtime-${var.environment}-aws"
    namespace = var.namespace
  }

  data = {
    AWS_ACCESS_KEY_ID     = aws_iam_access_key.waka-realtime.id
    AWS_SECRET_ACCESS_KEY = aws_iam_access_key.waka-realtime.secret
    AWS_DEFAULT_REGION    = data.aws_region.current.name
  }
}

resource "kubernetes_deployment" "waka-realtime" {
  for_each = var.realtime_regions
  metadata {
    name      = "waka-realtime-${each.key}"
    namespace = var.namespace
    labels = {
      app = "waka-realtime"
    }
  }

  spec {
    replicas = each.value

    selector {
      match_labels = {
        app    = "waka-realtime"
        region = each.key
      }
    }

    template {
      metadata {
        labels = {
          app    = "waka-realtime"
          region = each.key
        }
      }

      spec {
        automount_service_account_token = "true"
        container {
          image = "ghcr.io/dymajo/waka-server/realtime:${jsondecode(data.http.git_sha.body).commit.sha}"
          name  = "waka-realtime"

          env {
            name  = "KEYVALUE_PREFIX"
            value = "waka-${var.environment}-k8s"
          }

          env {
            name  = "KEYVALUE_REGION"
            value = data.aws_region.current.name
          }

          env {
            name  = "PREFIX"
            value = each.key
          }

          env_from {
            secret_ref {
              name = kubernetes_secret.waka-realtime.metadata.0.name
            }
          }

          // TODO: liveness & readiness probes
          resources {
            limits {
              cpu    = "100m"
              memory = "96Mi"
            }
            requests {
              cpu    = "20m"
              memory = "50Mi"
            }
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      spec.0.replicas
    ]
  }

  timeouts {
    create = "15m"
    update = "15m"
  }
}
