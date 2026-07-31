export const SYNCHRONIZATION_ALGORITHM_VERSION = "u2-linear-sync-v1";
export const OFFSET_DISCOVERY_ALGORITHM_VERSION = "u2-offset-cluster-v1";

export type SynchronizationMathAnchor = {
  id: string;
  kind: string;
  videoTimestampSeconds: number;
  replayTimestampSeconds: number;
  confidence: number;
  userConfirmed: boolean;
  replayRoundIndex?: number | null;
};

export type SynchronizationMapping = {
  offsetSeconds: number;
  slope: number;
  driftSecondsPerHour: number;
  rootMeanSquareErrorSeconds: number | null;
  confidence: number;
  confidenceLabel: "Unavailable" | "Low" | "Moderate" | "High";
  supportingEvidence: string[];
  conflictingEvidence: string[];
  missingEvidence: string[];
  residuals: Array<{ anchorId: string; residualSeconds: number }>;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, places = 6) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function confidenceLabel(
  confidence: number,
): SynchronizationMapping["confidenceLabel"] {
  if (confidence >= 0.8) return "High";
  if (confidence >= 0.6) return "Moderate";
  if (confidence > 0) return "Low";
  return "Unavailable";
}

export function calculateSynchronizationMapping(
  anchors: SynchronizationMathAnchor[],
): SynchronizationMapping {
  const usable = anchors.filter(
    (anchor) =>
      Number.isFinite(anchor.videoTimestampSeconds) &&
      Number.isFinite(anchor.replayTimestampSeconds) &&
      anchor.videoTimestampSeconds >= 0 &&
      anchor.replayTimestampSeconds >= 0,
  );

  if (usable.length === 0) {
    return {
      offsetSeconds: 0,
      slope: 1,
      driftSecondsPerHour: 0,
      rootMeanSquareErrorSeconds: null,
      confidence: 0,
      confidenceLabel: "Unavailable",
      supportingEvidence: [],
      conflictingEvidence: [],
      missingEvidence: [
        "Add at least one matched video/replay anchor to calculate an offset.",
        "Add a second anchor at a different replay time to measure drift.",
      ],
      residuals: [],
    };
  }

  const weights = usable.map((anchor) => clamp(anchor.confidence, 0.05, 1));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const replayMean =
    usable.reduce(
      (sum, anchor, index) =>
        sum + anchor.replayTimestampSeconds * (weights[index] ?? 0),
      0,
    ) / weightTotal;
  const videoMean =
    usable.reduce(
      (sum, anchor, index) =>
        sum + anchor.videoTimestampSeconds * (weights[index] ?? 0),
      0,
    ) / weightTotal;

  const replayVariance = usable.reduce((sum, anchor, index) => {
    const delta = anchor.replayTimestampSeconds - replayMean;
    return sum + (weights[index] ?? 0) * delta * delta;
  }, 0);
  const covariance = usable.reduce((sum, anchor, index) => {
    return (
      sum +
      (weights[index] ?? 0) *
        (anchor.replayTimestampSeconds - replayMean) *
        (anchor.videoTimestampSeconds - videoMean)
    );
  }, 0);
  const distinctReplayTimes = new Set(
    usable.map((anchor) => round(anchor.replayTimestampSeconds, 3)),
  ).size;
  const canMeasureDrift = usable.length >= 2 && distinctReplayTimes >= 2;
  const slope =
    canMeasureDrift && replayVariance > 0 ? covariance / replayVariance : 1;
  const offsetSeconds = canMeasureDrift
    ? videoMean - slope * replayMean
    : usable.reduce(
        (sum, anchor, index) =>
          sum +
          (anchor.videoTimestampSeconds - anchor.replayTimestampSeconds) *
            (weights[index] ?? 0),
        0,
      ) / weightTotal;
  const residuals = usable.map((anchor) => ({
    anchorId: anchor.id,
    residualSeconds: round(
      anchor.videoTimestampSeconds -
        (offsetSeconds + anchor.replayTimestampSeconds * slope),
    ),
  }));
  const rootMeanSquareErrorSeconds = Math.sqrt(
    residuals.reduce((sum, residual, index) => {
      return (
        sum +
        (weights[index] ?? 0) *
          residual.residualSeconds *
          residual.residualSeconds
      );
    }, 0) / weightTotal,
  );
  const driftSecondsPerHour = (slope - 1) * 3_600;

  const countScore = usable.length >= 3 ? 1 : usable.length === 2 ? 0.7 : 0.25;
  const averageAnchorConfidence =
    usable.reduce((sum, anchor) => sum + clamp(anchor.confidence, 0, 1), 0) /
    usable.length;
  const residualScore = canMeasureDrift
    ? clamp(1 - rootMeanSquareErrorSeconds / 2, 0, 1)
    : 0.3;
  const diversityScore = clamp(
    new Set(usable.map((anchor) => anchor.kind)).size / 2,
    0,
    1,
  );
  const confirmationScore =
    usable.filter((anchor) => anchor.userConfirmed).length / usable.length;
  let confidence =
    countScore * 0.3 +
    averageAnchorConfidence * 0.25 +
    residualScore * 0.2 +
    diversityScore * 0.1 +
    confirmationScore * 0.15;

  const supportingEvidence = [
    `${usable.length} matched anchor${usable.length === 1 ? "" : "s"} contributed to the mapping.`,
  ];
  const missingEvidence: string[] = [];
  const conflictingEvidence: string[] = [];

  if (usable.length === 1) {
    missingEvidence.push(
      "Only one anchor is available, so drift cannot be measured.",
    );
  } else if (!canMeasureDrift) {
    missingEvidence.push(
      "The anchors use the same replay time, so drift cannot be measured.",
    );
  } else {
    supportingEvidence.push(
      `The anchors span ${round(
        Math.max(...usable.map((item) => item.replayTimestampSeconds)) -
          Math.min(...usable.map((item) => item.replayTimestampSeconds)),
        2,
      )} replay seconds.`,
    );
    supportingEvidence.push(
      `The fitted mapping has ${round(rootMeanSquareErrorSeconds, 3)} seconds RMS anchor error.`,
    );
  }

  if (Math.abs(driftSecondsPerHour) > 120) {
    conflictingEvidence.push(
      `The calculated drift is ${round(
        driftSecondsPerHour,
        2,
      )} seconds per hour, outside the conservative verification limit.`,
    );
    confidence *= 0.55;
  } else if (Math.abs(driftSecondsPerHour) > 30) {
    conflictingEvidence.push(
      `The calculated drift is unusually large at ${round(
        driftSecondsPerHour,
        2,
      )} seconds per hour and needs visual review.`,
    );
    confidence *= 0.8;
  }
  if (rootMeanSquareErrorSeconds > 5) {
    conflictingEvidence.push(
      "The anchor residual error exceeds five seconds, so the points may not describe one stable timeline.",
    );
    confidence *= 0.6;
  }
  if (confirmationScore < 1) {
    missingEvidence.push(
      "One or more anchors have not been confirmed by the user.",
    );
  }

  confidence = round(clamp(confidence, 0, 1), 4);

  return {
    offsetSeconds: round(offsetSeconds),
    slope: round(slope, 9),
    driftSecondsPerHour: round(driftSecondsPerHour),
    rootMeanSquareErrorSeconds: round(rootMeanSquareErrorSeconds),
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    supportingEvidence,
    conflictingEvidence,
    missingEvidence,
    residuals,
  };
}

export function mapReplayToVideoTime({
  replayTimestampSeconds,
  offsetSeconds,
  slope,
  roundAdjustmentSeconds = 0,
}: {
  replayTimestampSeconds: number;
  offsetSeconds: number;
  slope: number;
  roundAdjustmentSeconds?: number;
}) {
  return round(
    offsetSeconds + replayTimestampSeconds * slope + roundAdjustmentSeconds,
  );
}

export type OffsetPair = {
  videoTimestampSeconds: number;
  replayTimestampSeconds: number;
  evidenceType: string;
  confidence: number;
  videoEvidence: string;
  replayEvidence: string;
};

export type OffsetCluster = {
  offsetSeconds: number;
  confidence: number;
  compatiblePairCount: number;
  distinctEvidenceTypeCount: number;
  evidence: OffsetPair[];
};

export function clusterOffsetPairs(
  pairs: OffsetPair[],
  toleranceSeconds = 3,
  limit = 5,
): OffsetCluster[] {
  const normalized = pairs
    .filter(
      (pair) =>
        Number.isFinite(pair.videoTimestampSeconds) &&
        Number.isFinite(pair.replayTimestampSeconds) &&
        pair.videoTimestampSeconds >= 0 &&
        pair.replayTimestampSeconds >= 0,
    )
    .map((pair) => ({
      ...pair,
      offset: pair.videoTimestampSeconds - pair.replayTimestampSeconds,
    }))
    .sort((left, right) => left.offset - right.offset);
  const clusters: Array<typeof normalized> = [];

  for (const pair of normalized) {
    const current = clusters.at(-1);
    const center = current?.length
      ? current.reduce((sum, item) => sum + item.offset, 0) / current.length
      : null;
    if (
      current &&
      center !== null &&
      Math.abs(pair.offset - center) <= toleranceSeconds
    ) {
      current.push(pair);
    } else {
      clusters.push([pair]);
    }
  }

  return clusters
    .map((cluster) => {
      const uniquePairs = Array.from(
        new Map(
          cluster.map((pair) => [
            `${round(pair.videoTimestampSeconds, 3)}:${round(
              pair.replayTimestampSeconds,
              3,
            )}:${pair.evidenceType}`,
            pair,
          ]),
        ).values(),
      );
      const weightedTotal = uniquePairs.reduce(
        (sum, pair) => sum + clamp(pair.confidence, 0.05, 1),
        0,
      );
      const offsetSeconds =
        uniquePairs.reduce(
          (sum, pair) =>
            sum +
            (pair.videoTimestampSeconds - pair.replayTimestampSeconds) *
              clamp(pair.confidence, 0.05, 1),
          0,
        ) / weightedTotal;
      const distinctEvidenceTypeCount = new Set(
        uniquePairs.map((pair) => pair.evidenceType),
      ).size;
      const dispersion =
        uniquePairs.reduce(
          (sum, pair) =>
            sum +
            Math.abs(
              pair.videoTimestampSeconds -
                pair.replayTimestampSeconds -
                offsetSeconds,
            ),
          0,
        ) / uniquePairs.length;
      const supportScore = clamp(uniquePairs.length / 4, 0, 1);
      const diversityScore = clamp(distinctEvidenceTypeCount / 3, 0, 1);
      const measurementScore =
        uniquePairs.reduce(
          (sum, pair) => sum + clamp(pair.confidence, 0, 1),
          0,
        ) / uniquePairs.length;
      const dispersionScore = clamp(1 - dispersion / toleranceSeconds, 0, 1);
      const confidence = clamp(
        supportScore * 0.35 +
          diversityScore * 0.2 +
          measurementScore * 0.25 +
          dispersionScore * 0.2,
        0,
        0.85,
      );
      return {
        offsetSeconds: round(offsetSeconds),
        confidence: round(confidence, 4),
        compatiblePairCount: uniquePairs.length,
        distinctEvidenceTypeCount,
        evidence: uniquePairs.slice(0, 20),
      };
    })
    .filter((cluster) => cluster.compatiblePairCount >= 2)
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        right.compatiblePairCount - left.compatiblePairCount,
    )
    .slice(0, limit);
}
