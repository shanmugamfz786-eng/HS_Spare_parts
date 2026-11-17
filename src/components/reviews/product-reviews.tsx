"use client";

import React, { useState, useTransition } from "react";
import { Star, MessageSquare, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { submitProductReviewAction } from "@/features/reviews/actions";
import type { ReviewDTO } from "@/features/reviews/schemas";

interface ProductReviewsProps {
  productId: string;
  initialReviews?: ReviewDTO[];
  sampleRating?: number;
  sampleReviewCount?: number;
}

export function ProductReviews({
  productId,
  initialReviews = [],
  sampleRating = 4.8,
  sampleReviewCount = 24,
}: ProductReviewsProps) {
  const [reviewsList] = useState<ReviewDTO[]>(initialReviews);
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    startTransition(async () => {
      const result = await submitProductReviewAction({
        productId,
        rating,
        title,
        body,
      });

      if (result.success && result.data) {
        setStatusMessage({
          type: "success",
          text: "Thank you! Your review has been submitted and is currently pending moderation before public display.",
        });
        setTitle("");
        setBody("");
        setRating(5);
      } else {
        setStatusMessage({
          type: "error",
          text: result.error || "Failed to submit review. Please ensure you are signed in.",
        });
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Reviews Summary Header */}
      <div className="p-6 rounded-card bg-ink-raised border border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h3 className="text-lg font-bold text-paper mb-1">Customer Ratings & Reviews</h3>
          <p className="text-xs text-gray-400">
            Real feedback from verified automotive technicians and vehicle owners.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-2xl font-black text-paper block">{sampleRating.toFixed(1)}</span>
            <span className="text-[11px] text-gray-400 block">{sampleReviewCount} sample ratings</span>
          </div>

          <div className="flex items-center text-amber-400">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={`w-5 h-5 ${s <= Math.round(sampleRating) ? "fill-current" : "text-gray-700"}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Review Submission Form */}
        <div className="lg:col-span-1 rounded-card bg-ink-raised border border-gray-800 p-6">
          <h4 className="text-sm font-bold text-paper mb-1 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-ember" />
            <span>Write a Product Review</span>
          </h4>
          <p className="text-xs text-gray-400 mb-4">
            Share your experience with fitment, material quality, and performance.
          </p>

          {statusMessage && (
            <div
              className={`mb-4 p-3 rounded-brand flex items-start gap-2 text-xs ${
                statusMessage.type === "success"
                  ? "bg-green-950/30 border border-green-800 text-green-300"
                  : "bg-red-950/30 border border-red-800 text-red-300"
              }`}
            >
              {statusMessage.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Star Rating Selector */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Your Rating
              </label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 text-gray-700 hover:scale-110 transition-transform focus:outline-none"
                    aria-label={`${star} star rating`}
                  >
                    <Star
                      className={`w-5 h-5 ${
                        star <= (hoverRating || rating)
                          ? "fill-amber-400 text-amber-400"
                          : "text-gray-700"
                      }`}
                    />
                  </button>
                ))}
                <span className="text-xs text-gray-400 ml-2 font-semibold">
                  {rating} of 5 Stars
                </span>
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Review Headline
              </label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={255}
                placeholder="e.g. Perfect OEM fitment for Swift 2018"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-ink border border-gray-700 rounded px-3 py-2 text-xs text-paper focus:outline-none focus:border-ember"
              />
            </div>

            {/* Body */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Review Details
              </label>
              <textarea
                required
                rows={4}
                minLength={10}
                maxLength={2000}
                placeholder="Describe installation experience, braking response, or packaging condition..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full bg-ink border border-gray-700 rounded px-3 py-2 text-xs text-paper focus:outline-none focus:border-ember resize-none"
              />
              <span className="text-[10px] text-gray-400 block mt-1">
                Minimum 10 characters. HTML tags will be automatically stripped.
              </span>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full btn-primary py-2.5 px-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Submit Review</span>
            </button>
          </form>
        </div>

        {/* Right: Reviews Feed */}
        <div className="lg:col-span-2 space-y-4">
          <h4 className="text-sm font-bold text-paper">
            Customer Reviews ({reviewsList.length + 2})
          </h4>

          {/* Illustrative Demo Reviews */}
          <div className="p-4 rounded-card bg-ink-raised border border-gray-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-paper">Rajesh Kumar</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                  Verified Technician (Illustrative Sample)
                </span>
              </div>
              <div className="flex items-center text-amber-400">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className="w-3.5 h-3.5 fill-current" />
                ))}
              </div>
            </div>
            <h5 className="text-xs font-bold text-paper">OEM quality brake pads with zero dust issues</h5>
            <p className="text-xs text-gray-400 leading-relaxed">
              Installed these on a customer&apos;s Maruti Swift 2019 Petrol. Initial bite is crisp, zero squealing, and backing plates match OEM dimensions to the millimeter.
            </p>
            <span className="text-[10px] text-gray-400 block">Demonstration sample review</span>
          </div>

          <div className="p-4 rounded-card bg-ink-raised border border-gray-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-paper">Vikram Mehta</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                  Car Enthusiast (Illustrative Sample)
                </span>
              </div>
              <div className="flex items-center text-amber-400">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className="w-3.5 h-3.5 fill-current" />
                ))}
              </div>
            </div>
            <h5 className="text-xs font-bold text-paper">Genuine Brembo packaging with tamper seal</h5>
            <p className="text-xs text-gray-400 leading-relaxed">
              Box came with the official holographic security seal. High heat tolerance observed on highway drives. Highly recommended for replacement.
            </p>
            <span className="text-[10px] text-gray-400 block">Demonstration sample review</span>
          </div>

          {/* User Submitted Approved Reviews */}
          {reviewsList.map((rev) => (
            <div
              key={rev.id}
              className="p-4 rounded-card bg-ink-raised border border-gray-800 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-paper">{rev.authorName}</span>
                <div className="flex items-center text-amber-400">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-3.5 h-3.5 ${s <= rev.rating ? "fill-current" : "text-gray-700"}`}
                    />
                  ))}
                </div>
              </div>
              <h5 className="text-xs font-bold text-paper">{rev.title}</h5>
              <p className="text-xs text-gray-300 leading-relaxed">{rev.body}</p>
              <span className="text-[10px] text-gray-400 block">
                {new Date(rev.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
