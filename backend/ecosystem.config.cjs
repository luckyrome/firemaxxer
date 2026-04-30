// PM2 process definition for firemaxxer-backend
// Usage: pm2 start ecosystem.config.cjs --env production
module.exports = {
  apps: [
    {
      name: 'firemaxxer-backend',
      script: './dist/index.js',
      cwd: '/opt/firemaxxer/backend',

      // Number of instances — use 'max' to fill all CPU cores, or a fixed number.
      // Requires sticky sessions or a shared Redis session store if > 1.
      instances: 1,
      exec_mode: 'fork',

      // Restart policy
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',

      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
