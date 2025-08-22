# Backend API (Node)
FROM node:20-alpine

WORKDIR /app

# Copy package files and install all dependencies
# Note: build context is the `backend` folder so copy from current context
COPY package*.json ./
RUN npm ci

# Copy application source
COPY . ./

# Expose API port
EXPOSE 3000

# Start using npm script (maps to `node src/server.js`)
CMD ["npm", "start"]
