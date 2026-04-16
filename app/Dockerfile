# Imagem base leve do Node.js 18
FROM node:18-alpine

# Diretório de trabalho dentro do container
WORKDIR /app

# Copia os ficheiros de dependências primeiro (cache eficiente)
COPY package*.json ./

# Instala dependências de produção
RUN npm ci --omit=dev

# Copia o restante do código
COPY . .

# Expõe a porta (Azure App Service usa a variável PORT)
EXPOSE 3000

# Inicia a aplicação
CMD ["node", "src/index.js"]
