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


# Redis - zona DNS para resolver la direccion privada
resource "azurerm_private_dns_zone" "tp2_redis_dns" {
  count               = var.enable_redis ? 1 : 0
  name                = "privatelink.redis.azure.net"
  resource_group_name = azurerm_resource_group.tp2_resource_group.name
}

# Redis - vinculo el DNS privado con la red del TP2
resource "azurerm_private_dns_zone_virtual_network_link" "tp2_redis_dns_link" {
  count                 = var.enable_redis ? 1 : 0
  name                  = "tp2-redis-dns-link"
  resource_group_name   = azurerm_resource_group.tp2_resource_group.name
  private_dns_zone_name = azurerm_private_dns_zone.tp2_redis_dns[0].name
  virtual_network_id    = azurerm_virtual_network.tp2_vn.id
}

# Redis - endpoint privado para las VM de arVault
resource "azurerm_private_endpoint" "tp2_redis_endpoint" {
  count               = var.enable_redis ? 1 : 0
  name                = "tp2-redis-endpoint"
  location            = azurerm_resource_group.tp2_resource_group.location
  resource_group_name = azurerm_resource_group.tp2_resource_group.name
  subnet_id           = azurerm_subnet.tp2_sn_redis.id

  private_service_connection {
    name                           = "tp2-redis-connection"
    private_connection_resource_id = azurerm_managed_redis.tp2_redis[0].id
    subresource_names              = ["redisEnterprise"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "tp2-redis-dns-group"
    private_dns_zone_ids = [azurerm_private_dns_zone.tp2_redis_dns[0].id]
  }
}

