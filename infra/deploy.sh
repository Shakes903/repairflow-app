#!/bin/bash
# ============================================================
# RepairFlow – Script de criação da infraestrutura no Azure
# Uso: bash deploy.sh
# Requer: Azure CLI instalado e autenticado (az login)
# ============================================================

set -e  # Para em caso de erro

# ── Variáveis (alterar conforme necessário) ──────────────────
RESOURCE_GROUP="repairflow-rg"
LOCATION="westeurope"
COSMOS_ACCOUNT="repairflow-cosmos-$RANDOM"
STORAGE_ACCOUNT="repairflowstorage$RANDOM"
ACR_NAME="repairflowacr$RANDOM"
APP_SERVICE_PLAN="repairflow-plan"
APP_SERVICE_NAME="repairflow-app-$RANDOM"
FUNCTION_APP_NAME="repairflow-functions-$RANDOM"
FUNCTION_STORAGE="repairflowfnstorage$RANDOM"
DB_NAME="repairflow"

echo "========================================"
echo "  RepairFlow – Deploy Azure"
echo "========================================"
echo ""

# ── 1. Criar Resource Group ──────────────────────────────────
echo "[1/9] A criar Resource Group..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none
echo "  ✓ Resource Group: $RESOURCE_GROUP"

# ── 2. Criar CosmosDB ────────────────────────────────────────
echo "[2/9] A criar CosmosDB (pode demorar ~2 min)..."
az cosmosdb create \
  --name "$COSMOS_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --locations regionName="$LOCATION" \
  --default-consistency-level "Session" \
  --output none

az cosmosdb sql database create \
  --account-name "$COSMOS_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DB_NAME" \
  --output none

# Coleção repairs
az cosmosdb sql container create \
  --account-name "$COSMOS_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --database-name "$DB_NAME" \
  --name "repairs" \
  --partition-key-path "/id" \
  --output none

# Coleção clients
az cosmosdb sql container create \
  --account-name "$COSMOS_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --database-name "$DB_NAME" \
  --name "clients" \
  --partition-key-path "/id" \
  --output none

# Coleção leases (necessária para o CosmosDB trigger das Functions)
az cosmosdb sql container create \
  --account-name "$COSMOS_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --database-name "$DB_NAME" \
  --name "leases" \
  --partition-key-path "/id" \
  --output none

COSMOS_ENDPOINT=$(az cosmosdb show --name "$COSMOS_ACCOUNT" --resource-group "$RESOURCE_GROUP" --query "documentEndpoint" -o tsv)
COSMOS_KEY=$(az cosmosdb keys list --name "$COSMOS_ACCOUNT" --resource-group "$RESOURCE_GROUP" --query "primaryMasterKey" -o tsv)
COSMOS_CONN=$(az cosmosdb keys list --name "$COSMOS_ACCOUNT" --resource-group "$RESOURCE_GROUP" --type connection-strings --query "connectionStrings[0].connectionString" -o tsv)
echo "  ✓ CosmosDB: $COSMOS_ACCOUNT"

# ── 3. Criar Storage Account ─────────────────────────────────
echo "[3/9] A criar Storage Account..."
az storage account create \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku "Standard_LRS" \
  --output none

az storage container create --name "repair-photos"  --account-name "$STORAGE_ACCOUNT" --public-access blob --output none
az storage container create --name "repair-reports" --account-name "$STORAGE_ACCOUNT" --public-access blob --output none

STORAGE_CONN=$(az storage account show-connection-string --name "$STORAGE_ACCOUNT" --resource-group "$RESOURCE_GROUP" --query "connectionString" -o tsv)
echo "  ✓ Storage Account: $STORAGE_ACCOUNT"

# ── 4. Criar Azure Container Registry ───────────────────────
echo "[4/9] A criar Container Registry..."
az acr create \
  --name "$ACR_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --sku "Basic" \
  --admin-enabled true \
  --output none

ACR_SERVER=$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query "loginServer" -o tsv)
ACR_USER=$(az acr credential show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query "username" -o tsv)
ACR_PASS=$(az acr credential show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query "passwords[0].value" -o tsv)
echo "  ✓ Container Registry: $ACR_SERVER"

# ── 5. Build e push da imagem Docker ────────────────────────
echo "[5/9] A fazer build e push da imagem Docker..."
cd ../app
az acr build \
  --registry "$ACR_NAME" \
  --image "repairflow:latest" \
  --file Dockerfile \
  . --output none
cd ../infra
echo "  ✓ Imagem publicada: $ACR_SERVER/repairflow:latest"

# ── 6. Criar App Service Plan ────────────────────────────────
echo "[6/9] A criar App Service Plan..."
az appservice plan create \
  --name "$APP_SERVICE_PLAN" \
  --resource-group "$RESOURCE_GROUP" \
  --is-linux \
  --sku "B1" \
  --output none
echo "  ✓ App Service Plan: $APP_SERVICE_PLAN (B1)"

# ── 7. Criar App Service (Web App via Docker) ────────────────
echo "[7/9] A criar App Service..."
az webapp create \
  --name "$APP_SERVICE_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --plan "$APP_SERVICE_PLAN" \
  --deployment-container-image-name "$ACR_SERVER/repairflow:latest" \
  --output none

# Configurar variáveis de ambiente na App Service
az webapp config appsettings set \
  --name "$APP_SERVICE_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    COSMOS_ENDPOINT="$COSMOS_ENDPOINT" \
    COSMOS_KEY="$COSMOS_KEY" \
    COSMOS_DB_NAME="$DB_NAME" \
    AZURE_STORAGE_CONNECTION_STRING="$STORAGE_CONN" \
    WEBSITES_PORT=3000 \
  --output none

# Configurar credenciais ACR na App Service
az webapp config container set \
  --name "$APP_SERVICE_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --docker-registry-server-url "https://$ACR_SERVER" \
  --docker-registry-server-user "$ACR_USER" \
  --docker-registry-server-password "$ACR_PASS" \
  --output none

echo "  ✓ App Service: https://$APP_SERVICE_NAME.azurewebsites.net"

# ── 8. Criar Storage para as Functions ───────────────────────
echo "[8/9] A criar Function App..."
az storage account create \
  --name "$FUNCTION_STORAGE" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku "Standard_LRS" \
  --output none

az functionapp create \
  --name "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --storage-account "$FUNCTION_STORAGE" \
  --consumption-plan-location "$LOCATION" \
  --runtime "node" \
  --runtime-version "18" \
  --functions-version "4" \
  --output none

az functionapp config appsettings set \
  --name "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    COSMOS_ENDPOINT="$COSMOS_ENDPOINT" \
    COSMOS_KEY="$COSMOS_KEY" \
    COSMOS_DB_NAME="$DB_NAME" \
    COSMOS_CONNECTION_STRING="$COSMOS_CONN" \
  --output none

echo "  ✓ Function App: $FUNCTION_APP_NAME"

# ── 9. Resumo ────────────────────────────────────────────────
echo ""
echo "========================================"
echo "  Deploy concluído com sucesso!"
echo "========================================"
echo ""
echo "  🌐 App Web:        https://$APP_SERVICE_NAME.azurewebsites.net"
echo "  🗄️  CosmosDB:       $COSMOS_ACCOUNT"
echo "  📦 Storage:        $STORAGE_ACCOUNT"
echo "  🐳 Registry:       $ACR_SERVER"
echo "  ⚡ Functions:      $FUNCTION_APP_NAME"
echo ""
echo "  Guarda estas variáveis para o .env:"
echo "  COSMOS_ENDPOINT=$COSMOS_ENDPOINT"
echo "  COSMOS_KEY=$COSMOS_KEY"
echo "  AZURE_STORAGE_CONNECTION_STRING=$STORAGE_CONN"
echo ""
