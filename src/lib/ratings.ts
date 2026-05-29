export interface CombinedRating {
  rating: number;
  totalCount: number;
  googleCount: number;
  treatwellCount: number;
  hasGoogle: boolean;
  hasTreatwell: boolean;
}

export function getCombinedRating(params: {
  google_rating_avg: number | null;
  google_review_count: number | null;
  treatwell_rating_avg: number | null;
  treatwell_review_count: number | null;
}): CombinedRating | null {
  const { google_rating_avg, google_review_count, treatwell_rating_avg, treatwell_review_count } = params;

  const hasGoogle = google_rating_avg != null && (google_review_count ?? 0) > 0;
  const hasTreatwell = treatwell_rating_avg != null && (treatwell_review_count ?? 0) > 0;

  if (!hasGoogle && !hasTreatwell) return null;

  const gAvg   = hasGoogle    ? google_rating_avg!    : 0;
  const gCount = hasGoogle    ? google_review_count!  : 0;
  const tAvg   = hasTreatwell ? treatwell_rating_avg! : 0;
  const tCount = hasTreatwell ? treatwell_review_count! : 0;

  const totalCount = gCount + tCount;
  const raw        = (gAvg * gCount + tAvg * tCount) / totalCount;

  return {
    rating: Math.round(raw * 10) / 10,
    totalCount,
    googleCount:    gCount,
    treatwellCount: tCount,
    hasGoogle,
    hasTreatwell,
  };
}
