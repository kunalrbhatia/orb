module.exports = {
  apps: [
    {
      name: 'orb-algo',
      script: './dist/main.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
    },
  ],
};
