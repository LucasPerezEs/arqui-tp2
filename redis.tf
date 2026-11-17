# Redis administrado para compartir el estado de arVault entre nodos
resource "azurerm_managed_redis" "tp2_redis" {
  count               = var.enable_redis ? 1 : 0
  name                = "tp2-arvault-redis"
  resource_group_name = azurerm_resource_group.tp2_resource_group.name
  location            = azurerm_resource_group.tp2_resource_group.location

  # Configuracion minima sin alta disponibilidad
  sku_name                  = "Balanced_B0"
  high_availability_enabled = false

  default_database {
    access_keys_authentication_enabled = true
  }
}

# Datos de conexion para las instancias de arVault
output "redis_hostname" {
  value = var.enable_redis ? azurerm_managed_redis.tp2_redis[0].hostname : null
}

output "redis_port" {
  value = var.enable_redis ? azurerm_managed_redis.tp2_redis[0].default_database[0].port : null
}
