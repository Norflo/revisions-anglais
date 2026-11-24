plugins {
    id("com.android.application")
}

val appKeystore: String? = System.getenv("APP_KEYSTORE")

android {
    namespace = "fr.revisionsanglais"
    compileSdk = 35

    defaultConfig {
        applicationId = "fr.revisionsanglais"
        minSdk = 26
        targetSdk = 34
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
    }

    signingConfigs {
        if (appKeystore != null) {
            create("app") {
                storeFile = file(appKeystore)
                storePassword = System.getenv("APP_KEYSTORE_PASSWORD")
                keyAlias = "revisionsanglais"  // clé propre à l'appli (secrets ANGLAIS_KEYSTORE_*)
                keyPassword = System.getenv("APP_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Clé fixe (secrets GitHub) : chaque nouvelle version s'installe par-dessus
            // l'ancienne sans perdre les progrès. Sans elle (build local) : clé de debug.
            signingConfig = if (appKeystore != null) signingConfigs.getByName("app")
            else signingConfigs.getByName("debug")
        }
    }

    sourceSets {
        // La page et les sons (anglais/site) sont mis dans l'APK : l'appli marche hors connexion.
        getByName("main").assets.srcDirs("../../site")
    }

    // Les sons des 3000 mots (≈ 50 Mo) restent hors de l'APK : téléchargés quand on touche un mot.
    androidResources {
        ignoreAssetsPattern = "!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~:!audio3000"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
