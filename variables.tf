variable "azure_sid" {
  sensitive = true
}

variable "datadog_key" {
  sensitive = true
}

variable "dockerhub_username" {
  sensitive = true
}

variable "dockerhub_token" {
  sensitive = true
}

variable "region" {
  default = "eastus2"
}

variable "ssh_key_group_name" {
  default = "TP2"
}

variable "ssh_key_name" {
  default = "TP2-Arqui"
}

variable "os_publisher" {
  default = "Canonical"
}

variable "os_offer" {
  default = "ubuntu-24_04-lts"
}

variable "os_sku" {
  default = "server"
}

variable "os_version" {
  default = "latest"
}

variable "machine_sku" {
  default = "Standard_D2als_v7"
}

# Permite preparar Redis sin crearlo todavia en Azure
variable "enable_redis" {
  type    = bool
  default = false
}