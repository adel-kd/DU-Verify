pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds(abortPrevious: true)
  }

  parameters {
    password(name: 'RENDER_DEPLOY_HOOK', defaultValue: '', description: 'Optional Render deploy hook')
    password(name: 'VERCEL_MERCHANT_DEPLOY_HOOK', defaultValue: '', description: 'Optional merchant Vercel deploy hook')
    password(name: 'VERCEL_DEVELOPER_DEPLOY_HOOK', defaultValue: '', description: 'Optional developer Vercel deploy hook')
  }

  stages {
    stage('Install and test') {
      parallel {
        stage('Backend') {
          steps {
            dir('server') {
              sh 'npm ci'
              sh 'npm test'
              sh 'node --check src/server.js'
            }
          }
        }
        stage('Frontend') {
          steps {
            dir('client') {
              sh 'npm ci'
              sh 'npm test'
              sh 'npm run build'
            }
          }
        }
      }
    }

    stage('Build containers') {
      steps {
        sh 'docker build -t du-verify-api:${BUILD_NUMBER} server'
        sh 'docker build --build-arg VITE_APP_SURFACE=merchant -t du-verify-client:${BUILD_NUMBER} client'
        sh 'docker build --build-arg VITE_APP_SURFACE=developer -t du-verify-developer:${BUILD_NUMBER} client'
      }
    }

    stage('Deploy production') {
      when {
        branch 'main'
      }
      steps {
        script {
          def hooks = [
            params.RENDER_DEPLOY_HOOK,
            params.VERCEL_MERCHANT_DEPLOY_HOOK,
            params.VERCEL_DEVELOPER_DEPLOY_HOOK
          ].findAll { it?.trim() }

          if (hooks.isEmpty()) {
            echo 'No deploy hooks supplied; Git-connected hosting can deploy this main-branch commit.'
          } else {
            hooks.each { hook ->
              withEnv(["DU_VERIFY_DEPLOY_HOOK=${hook}"]) {
                sh 'curl --fail --silent --show-error --retry 3 --request POST "$DU_VERIFY_DEPLOY_HOOK"'
              }
            }
          }
        }
      }
    }
  }

  post {
    always {
      deleteDir()
    }
  }
}
