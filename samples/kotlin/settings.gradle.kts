// The Kotlin code samples of the polyjose docs: JUnit 5 tests against the polyjose-jvm jar built
// from the pinned commit (scripts/samples/platforms/kotlin.sh). Never published.
//
// Every version comes from polyjose's own version catalog at that commit, so the samples build
// with the Kotlin, JNA and JUnit versions the library itself uses. kotlin.sh runs this build with
// polyjose's Gradle wrapper.
//
// With a registry pin there is no export of a pinned commit: kotlin.sh fetches polyjose's sources
// at the release tag for the wrapper and the catalog, and passes the catalog as -Ppolyjose.catalog.

pluginManagement {
    repositories {
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositoriesMode = RepositoriesMode.FAIL_ON_PROJECT_REPOS
    repositories {
        mavenCentral()
    }
    versionCatalogs {
        create("libs") {
            from(files(providers.gradleProperty("polyjose.catalog")
                .getOrElse("../.polyjose/export/polyjose/platforms/android/gradle/libs.versions.toml")))
        }
    }
}

rootProject.name = "polyjose-samples"
