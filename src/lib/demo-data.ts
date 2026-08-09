export type DemoLocation = {
  id: string;
  location_name: string;
  title: string;
  primary_category: string;
  city: string;
  country: string;
};

export type DemoReview = {
  id: string;
  google_review_id: string;
  reviewer_name: string;
  star_rating: number;
  comment: string;
  status: "new" | "queued" | "replied" | "skipped";
  reply_comment?: string;
  review_update_time: string;
};

export const demoLocations: DemoLocation[] = [
  {
    id: "demo-1",
    location_name: "locations/123456789",
    title: "BurgerMat - Madrid",
    primary_category: "Burger restaurant",
    city: "Madrid",
    country: "Spain",
  },
  {
    id: "demo-2",
    location_name: "locations/987654321",
    title: "BurgerMat - Barcelona",
    primary_category: "Burger restaurant",
    city: "Barcelona",
    country: "Spain",
  },
  {
    id: "demo-3",
    location_name: "locations/456789123",
    title: "BurgerMat - Valencia",
    primary_category: "Burger restaurant",
    city: "Valencia",
    country: "Spain",
  },
];

export function demoReviews(): DemoReview[] {
  const reviews: DemoReview[] = [
    {
      id: "demo-review-1",
      google_review_id: "demo-google-review-1",
      reviewer_name: "Maria Garcia",
      star_rating: 5,
      comment: "Amazing burgers! The staff was super friendly and the food came out quickly. Will definitely come back.",
      status: "new",
      review_update_time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "demo-review-2",
      google_review_id: "demo-google-review-2",
      reviewer_name: "Carlos Rodriguez",
      star_rating: 4,
      comment: "Good food and nice atmosphere. The only thing is the waiting time was a bit long during peak hours.",
      status: "queued",
      review_update_time: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "demo-review-3",
      google_review_id: "demo-google-review-3",
      reviewer_name: "Ana Martinez",
      star_rating: 5,
      comment: "Best burger place in Madrid! The quality is always consistent and the prices are fair.",
      status: "replied",
      reply_comment: "Thank you so much, Ana! We're thrilled to hear you love our burgers. See you soon!",
      review_update_time: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "demo-review-4",
      google_review_id: "demo-google-review-4",
      reviewer_name: "Jose Fernandez",
      star_rating: 3,
      comment: "The burger was okay but the fries were cold. Service was fine though.",
      status: "queued",
      review_update_time: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "demo-review-5",
      google_review_id: "demo-google-review-5",
      reviewer_name: "Laura Sanchez",
      star_rating: 5,
      comment: "Perfect place for a quick lunch. The staff remembered my order from last time. Great customer service!",
      status: "replied",
      reply_comment: "Hi Laura! We're so happy to see you again. Thank you for the kind words!",
      review_update_time: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "demo-review-6",
      google_review_id: "demo-google-review-6",
      reviewer_name: "Pedro Lopez",
      star_rating: 2,
      comment: "Waited 45 minutes for my order. The burger was dry and the bun was stale. Very disappointed.",
      status: "new",
      review_update_time: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "demo-review-7",
      google_review_id: "demo-google-review-7",
      reviewer_name: "Sofia Torres",
      star_rating: 4,
      comment: "Nice variety of options. The vegetarian burger is really good. Would recommend!",
      status: "new",
      review_update_time: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "demo-review-8",
      google_review_id: "demo-google-review-8",
      reviewer_name: "Miguel Ruiz",
      star_rating: 5,
      comment: "Excellent quality and fast service. The location is convenient and parking is easy.",
      status: "replied",
      reply_comment: "Thank you, Miguel! We appreciate your feedback and are glad you had a great experience.",
      review_update_time: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  return reviews;
}

export const demoAuditMarkdown = `## Quick score

Your Google Business Profile scores **72/100** based on our analysis.

## Priority fixes

1. **Missing business hours** - Your profile shows "Hours may vary" which can reduce trust. Add specific opening hours for each day.

2. **Incomplete description** - Your business description is too short (only 45 characters). Google recommends at least 750 characters to help with local SEO.

3. **Low photo count** - You have 8 photos, but competitors in your area average 25+. Add more photos of your food, interior, and staff.

4. **No posts in 30 days** - Regular posts help you stay visible in search results. Post at least once per week.

## Suggested profile name

**Current:** BurgerMat - Madrid

**Suggestion:** Keep as is. Your name is clear and includes the location.

## Suggested description

Here's an improved description for your profile:

"BurgerMat is a family-friendly burger restaurant in the heart of Madrid, serving fresh, high-quality burgers made with locally sourced ingredients. We offer a wide variety of options including classic beef burgers, vegetarian alternatives, and gluten-free buns. Our friendly staff is committed to providing excellent service in a welcoming atmosphere. Perfect for lunch, dinner, or a quick bite. We also offer takeout and delivery services. Visit us today and taste the difference!"

## Post ideas for the next 30 days

1. **Week 1:** "New menu item alert! Try our limited-time BBQ Bacon Burger, available this week only."

2. **Week 2:** "Behind the scenes: Meet our head chef and learn about our commitment to using fresh, local ingredients."

3. **Week 3:** "Customer spotlight: Share a photo of a happy customer enjoying their meal (with permission)."

4. **Week 4:** "Special offer: Mention this post and get 10% off your next order. Valid until the end of the month."

## Image recommendations

1. **Food photos** - Add 5-10 high-quality photos of your most popular menu items. Use natural lighting and make sure the food looks appetizing.

2. **Interior shots** - Show your dining area, highlighting the atmosphere and cleanliness.

3. **Team photos** - Include photos of your friendly staff to build trust and show the human side of your business.

4. **Exterior photo** - Make sure you have a clear, well-lit photo of your storefront so customers can easily find you.

5. **Action shots** - Photos of food being prepared or served can create a sense of freshness and quality.`;



export const demoProjects = [
  {
    id: "demo-project-1",
    user_id: "demo-user",
    title: "Why Local SEO Matters for Small Businesses",
    type: "blog",
    input: {
      businessName: "BurgerMat",
      city: "Madrid",
      service: "Burger Restaurant",
      tone: "Professional",
    },
    output_md: "# Why Local SEO Matters for Small Businesses\n\nIn today's digital age, having a strong online presence is crucial for small businesses. Local SEO helps you connect with customers in your area who are actively searching for your products or services.\n\n## Benefits of Local SEO\n\n1. **Increased Visibility:** Rank higher in local search results.\n2. **More Traffic:** Drive more foot traffic to your store.\n3. **Better Conversion Rates:** Target customers who are ready to buy.\n\n## How to Improve Your Local SEO\n\n- Optimize your Google Business Profile.\n- Get more reviews.\n- Use local keywords in your content.\n\nStart optimizing your local SEO today and watch your business grow!",
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-project-2",
    user_id: "demo-user",
    title: "New Summer Menu Launch",
    type: "gbp_post",
    input: {
      businessName: "BurgerMat",
      city: "Madrid",
      service: "Summer Menu",
      tone: "Exciting",
    },
    output_md: "☀️ **Summer is here at BurgerMat!** ☀️\n\nWe are excited to announce our new summer menu featuring fresh salads, refreshing drinks, and our limited-time BBQ Pineapple Burger! 🍍🍔\n\nCome visit us in Madrid and taste the flavors of summer. Perfect for a sunny day out with friends and family.\n\n#BurgerMat #SummerMenu #Madrid #Foodie #BBQBurger",
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-project-3",
    user_id: "demo-user",
    title: "FAQ: Delivery Options",
    type: "faq",
    input: {
      businessName: "BurgerMat",
      city: "Madrid",
      service: "Delivery",
      tone: "Helpful",
    },
    output_md: "### Frequently Asked Questions\n\n**Q: Do you offer delivery?**\n\nA: Yes, we offer delivery through our partners UberEats and Glovo. You can also order directly from our website for pickup.\n\n**Q: What is the delivery area?**\n\nA: We deliver within a 5km radius of our Madrid location.\n\n**Q: Is there a minimum order for delivery?**\n\nA: There is no minimum order, but a small delivery fee may apply depending on your location.",
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
];
