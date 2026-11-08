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
# --no-daemon: no Gradle daemon is left running afterwards.
# shellcheck source=common.sh
. "$SAMPLES_ROOT/scripts/samples/platforms/common.sh"

samples_need cargo java
samples_git_only
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
