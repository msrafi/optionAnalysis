import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/optionAnalysis/',
  plugins: [
    react(),
    // Custom plugin to copy data files
    {
      name: 'copy-data-files',
      writeBundle() {
        const __dirname = fileURLToPath(new URL('.', import.meta.url))
        const dataDir = join(__dirname, 'data')
        const distDataDir = join(__dirname, 'dist', 'data')
        const publicApiDir = join(__dirname, 'public', 'api')
        const distApiDir = join(__dirname, 'dist', 'api')
        
        try {
          // Copy all CSV files from data directory to dist/data
          mkdirSync(distDataDir, { recursive: true })
          const files = readdirSync(dataDir)
          
          files.forEach((file: string) => {
            if (file.endsWith('.csv')) {
              copyFileSync(
                join(dataDir, file),
                join(distDataDir, file)
              )
            }
          })
          
          console.log('✅ Data files copied to dist/data/')
          
          // Copy API files to dist/api
          mkdirSync(distApiDir, { recursive: true })
          copyFileSync(
            join(publicApiDir, 'data-files.json'),
            join(distApiDir, 'data-files.json')
          )
          copyFileSync(
            join(publicApiDir, 'darkpool-data-files.json'),
            join(distApiDir, 'darkpool-data-files.json')
          )
          
          console.log('✅ API files copied to dist/api/')
          
          // Copy .nojekyll file to dist root for GitHub Pages
          const nojekyllSource = join(__dirname, 'public', '.nojekyll')
          const nojekyllDest = join(__dirname, 'dist', '.nojekyll')
          try {
            copyFileSync(nojekyllSource, nojekyllDest)
            console.log('✅ .nojekyll file copied to dist/')
          } catch (nojekyllError) {
            // .nojekyll might not exist, which is okay - Vite should copy it from public
            console.warn('⚠️  .nojekyll file not found in public/, but Vite may copy it automatically')
          }
        } catch (error) {
          console.error('❌ Error copying files:', error)
        }
      }
    }
  ],
  server: {
    port: 3000,
    open: true,
    hmr: {
      overlay: false
    }
  },
  build: {
    // Optimize build for better performance
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          utils: ['lucide-react']
        },
        // Use hash for cache busting (Vite's hash changes when content changes)
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`
      }
    },
    // Enable source maps for debugging
    sourcemap: true,
    // Optimize chunk size
    chunkSizeWarningLimit: 1000
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'lucide-react']
  }
})
