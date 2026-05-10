FROM ghcr.io/puppeteer/puppeteer:latest

# Switch to root to copy files and adjust permissions
USER root

# Create app directory
WORKDIR /usr/src/app

# Tell Puppeteer to skip downloading Chrome during npm install.
# The base Docker image already has Chrome pre-installed.
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Tell Puppeteer to use the Chrome binary that ships with the Docker image.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy all project files
COPY . .

# Change ownership of the app directory to the pptruser
RUN chown -R pptruser:pptruser /usr/src/app

# Switch back to the non-root user for security
USER pptruser

EXPOSE 3000

CMD ["node", "index.js"]
