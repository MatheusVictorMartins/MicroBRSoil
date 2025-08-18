# Backend API (Node)
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production deps
# Note: build context is the `backend` folder so copy from current context
COPY package*.json ./
RUN npm ci --only=production

# Copy application source
COPY . ./

# Expose API port
EXPOSE 3000

# Start using npm script (maps to `node src/server.js`)
CMD ["npm", "start"]
