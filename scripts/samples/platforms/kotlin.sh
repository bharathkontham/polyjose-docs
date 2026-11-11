# shellcheck shell=bash
# The Kotlin samples runner, sourced by scripts/samples/run.sh (see "Platform runners" in
# samples/README.md).
#
# Git mode, in the copy of the pinned commit that common.sh exports:
#   1. polyjose's Gradle build makes the desktop JVM jar (`:polyjose-jvm:jar`, which also builds
#      polyjose-ffi with cargo). Configuring that build needs the Android SDK, because the same
#      build holds the AAR.
#   2. samples/kotlin runs its JUnit 5 tests against that jar, with polyjose's Gradle wrapper and
#      version catalog. Its build output and Gradle caches go under samples/.polyjose.
#
# Registry mode: samples/kotlin depends on dev.polyjose:polyjose-jvm at the pinned version from
# Maven Central (-Ppolyjose.version), with the dependencies its POM declares. Nothing is built from
# a checkout; polyjose's sources at the release tag (v<version>) are fetched into
# samples/.polyjose/registry/polyjose only for its Gradle wrapper and version catalog, so the
# samples still build with the Kotlin and JUnit versions the library uses. POLYJOSE_GIT_URL
# overrides where the tag is fetched from.
# --no-daemon: no Gradle daemon is left running afterwards.
# shellcheck source=common.sh
. "$SAMPLES_ROOT/scripts/samples/platforms/common.sh"

samples_need java

if [ "$SAMPLES_PIN_SOURCE" = registry ]; then
  samples_need git
  tag="v$SAMPLES_PIN_VERSION"
  src="$SAMPLES_WORK_DIR/registry/polyjose"
  url=${POLYJOSE_GIT_URL:-https://github.com/bharathkontham/polyjose.git}
  echo "==> kotlin: fetch polyjose $tag for its Gradle wrapper and version catalog"
  rm -rf "$src"
  mkdir -p "$src"
  git init -q "$src"
  git -C "$src" fetch -q --depth 1 "$url" "refs/tags/$tag"
  git -C "$src" -c advice.detachedHead=false checkout -q --detach FETCH_HEAD
  android="$src/platforms/android"

  echo "==> kotlin: samples against dev.polyjose:polyjose-jvm:$SAMPLES_PIN_VERSION from Maven Central (gradlew -p samples/kotlin test)"
  "$android/gradlew" --no-daemon --console=plain -p "$SAMPLES_ROOT/samples/kotlin" \
    --project-cache-dir "$SAMPLES_WORK_DIR/gradle/kotlin-samples-registry" \
    -Ppolyjose.version="$SAMPLES_PIN_VERSION" \
    -Ppolyjose.catalog="$android/gradle/libs.versions.toml" \
    -Psamples.buildDir="$SAMPLES_WORK_DIR/build/kotlin-samples-registry" \
    -Pkotlin.project.persistent.dir="$SAMPLES_WORK_DIR/gradle/kotlin-samples-registry-kotlin" \
    test
  return 0
fi

samples_need cargo
[ -n "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ] \
  || samples_skip "polyjose's Gradle build needs the Android SDK to configure; set ANDROID_HOME"
samples_export_polyjose

android="$POLYJOSE_EXPORT/platforms/android"
echo "==> kotlin: build the polyjose-jvm jar (gradlew :polyjose-jvm:jar)"
(cd "$android" && ./gradlew --no-daemon --console=plain :polyjose-jvm:jar)

# The jar task's one output; the sources and javadoc jars are other tasks.
jars=$(find "$android/polyjose-jvm/build/libs" -maxdepth 1 -name 'polyjose-jvm-*.jar' \
  ! -name '*-sources.jar' ! -name '*-javadoc.jar' -print)
[ -n "$jars" ] && [ "$(printf '%s\n' "$jars" | wc -l | tr -d ' ')" = 1 ] \
  || { echo "kotlin: expected one polyjose-jvm jar in $android/polyjose-jvm/build/libs" >&2; exit 1; }

echo "==> kotlin: samples (gradlew -p samples/kotlin test)"
"$android/gradlew" --no-daemon --console=plain -p "$SAMPLES_ROOT/samples/kotlin" \
  --project-cache-dir "$SAMPLES_WORK_DIR/gradle/kotlin-samples" \
  -Ppolyjose.jvmJar="$jars" \
  -Psamples.buildDir="$SAMPLES_WORK_DIR/build/kotlin-samples" \
  -Pkotlin.project.persistent.dir="$SAMPLES_WORK_DIR/gradle/kotlin-samples-kotlin" \
  test
