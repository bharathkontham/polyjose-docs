# Stub platform runner: reports its environment and passes.
echo "runner ran: $SAMPLES_PLATFORM"
echo "cwd=$(pwd -P)"
echo "SAMPLES_ROOT=$SAMPLES_ROOT"
echo "SAMPLES_PIN_SOURCE=$SAMPLES_PIN_SOURCE"
echo "SAMPLES_PIN_REV=$SAMPLES_PIN_REV"
echo "SAMPLES_PIN_VERSION=$SAMPLES_PIN_VERSION"
echo "SAMPLES_WORK_DIR=$SAMPLES_WORK_DIR"
echo "POLYJOSE_DIR=$POLYJOSE_DIR"
if [ -n "$POLYJOSE_DIR" ]; then
  echo "POLYJOSE_HEAD=$(git -C "$POLYJOSE_DIR" rev-parse HEAD)"
fi
