interface TrailingResult {
  shouldModifySl: boolean;
  newSlValue: number;
}

export function checkTrailingSl(
  currentMtm: number,
  netDebit: number,
  currentSlValue: number,
  trailingStage: number,
): TrailingResult {
  const riskFreeThreshold = 2000;
  const trailIncrement = 500;

  let nextStage = trailingStage;
  let newSl = currentSlValue;

  if (trailingStage === 0 && currentMtm >= riskFreeThreshold) {
    // Stage 1: Risk-free
    nextStage = 1;
    newSl = netDebit; // SL at entry cost
  } else if (trailingStage >= 1) {
    const profitLocked = (trailingStage - 1) * trailIncrement;
    const nextThreshold = riskFreeThreshold + trailingStage * trailIncrement;

    if (currentMtm >= nextThreshold) {
      nextStage = trailingStage + 1;
      newSl = netDebit + profitLocked + trailIncrement;
    }
  }

  return {
    shouldModifySl: nextStage > trailingStage,
    newSlValue: newSl,
  };
}
