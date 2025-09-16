// app/api/generate-insights/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { analysisType, data, insightSummaries } = await request.json();
    
    let prompt = '';
    
    // Handle backward compatibility - if no analysisType, use old global prompt
    if (!analysisType) {
      prompt = createLegacyPrompt(insightSummaries);
    } else {
      switch (analysisType) {
        case 'foundational':
          prompt = createFoundationalPrompt(data, insightSummaries);
          break;
        case 'segment':
          prompt = createSegmentPrompt(data, insightSummaries);
          break;
        case 'affinity':
          prompt = createAffinityPrompt(data, insightSummaries);
          break;
        case 'profiles':
          prompt = createProfilesPrompt(data, insightSummaries);
          break;
        default:
          throw new Error('Invalid analysis type');
      }
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Anthropic API error: ${response.status} - ${errorText}`);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const apiData = await response.json();
    const content = apiData.content[0].text.trim();

    return NextResponse.json({
      success: true,
      insights: content
    });

  } catch (error) {
    console.error('Error generating insights:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to generate insights' 
      },
      { status: 500 }
    );
  }
}

function createFoundationalPrompt(productMetrics: any[], insightSummaries: any): string {
  const topPerformer = productMetrics.reduce((max, product) => 
    product.spaceEfficiencyIndex > max.spaceEfficiencyIndex ? product : max
  );
  const bottomPerformer = productMetrics.reduce((min, product) => 
    product.spaceEfficiencyIndex < min.spaceEfficiencyIndex ? product : min
  );
  const avgSEI = productMetrics.reduce((sum, p) => sum + p.spaceEfficiencyIndex, 0) / productMetrics.length;
  
  return `Analyze this catalog performance data and provide 2-3 specific space optimization recommendations.

KEY METRICS:
- Top performer: ${topPerformer['Product Name']} (SEI: ${topPerformer.spaceEfficiencyIndex.toFixed(1)})
- Bottom performer: ${bottomPerformer['Product Name']} (SEI: ${bottomPerformer.spaceEfficiencyIndex.toFixed(1)})
- Catalog average SEI: ${avgSEI.toFixed(1)}
- High performers (SEI >120): ${productMetrics.filter(p => p.spaceEfficiencyIndex > 120).length}/${productMetrics.length} products
- Underperformers (SEI <80): ${productMetrics.filter(p => p.spaceEfficiencyIndex < 80).length}/${productMetrics.length} products

Provide actionable recommendations for space reallocation, product positioning, and performance optimization only. Include quantified impact where possible. Do not include phrases like 'would you like me to elaborate' or 'here are my recommendations'. Write as a business analyst delivering findings, not as a conversational assistant.`;
}

function createSegmentPrompt(segmentData: any[], insightSummaries: any): string {
  const topSegment = segmentData[0];
  const segments = segmentData.map(s => `${s.segment}: ${s.weightedAvgSEI} SEI, $${s.revenuePerSqIn}/sq in`).join('\n');
  
  return `Analyze customer segment performance and provide 2-3 strategic recommendations for circulation and targeting optimization.

SEGMENT PERFORMANCE:
${segments}

Top performing segment: ${topSegment.segment} 
- Efficiency: ${topSegment.weightedAvgSEI} SEI
- Revenue density: ${topSegment.revenuePerSqIn}/sq inch
- Customer count: ${topSegment.customers}

Focus on circulation strategy, segment-specific catalog versions, customer acquisition adjustments, and revenue optimization through targeted offerings. Do not include phrases like 'would you like me to elaborate' or 'here are my recommendations'. Write as a business analyst delivering findings, not as a conversational assistant.`;
}

function createAffinityPrompt(affinityData: any[], insightSummaries: any): string {
  const topPairs = affinityData.slice(0, 3);
  const pairsList = topPairs.map(pair => 
    `${pair.anchorProduct} + ${pair.boughtWithProduct} (${pair.combinedEfficiency} efficiency, ${pair.coPurchases} co-purchases)`
  ).join('\n');
  
  return `Analyze product affinity data and provide 2-3 specific recommendations for catalog layout and cross-merchandising.

TOP PRODUCT AFFINITIES:
${pairsList}

ANALYSIS CONTEXT:
- Total product pairs identified: ${affinityData.length}
- High-efficiency pairs (>150): ${affinityData.filter(p => p.combinedEfficiency > 150).length}
- Average combined efficiency: ${(affinityData.reduce((sum, p) => sum + p.combinedEfficiency, 0) / affinityData.length).toFixed(1)}

Provide actionable catalog design and merchandising recommendations focusing on product placement, cross-selling opportunities, and spread design optimization. Do not include phrases like 'would you like me to elaborate' or 'here are my recommendations'. Write as a business analyst delivering findings, not as a conversational assistant.`;
}

function createProfilesPrompt(profileData: any[], insightSummaries: any): string {
  const topCustomers = profileData.slice(0, 5);
  const multiProductCustomers = profileData.filter(p => p.productsBought > 1).length;
  const avgSEI = profileData.reduce((sum, p) => sum + p.revenueWeightedSEI, 0) / profileData.length;
  
  const topCustomersList = topCustomers.map(customer => 
    `${customer.ageRange} ${customer.incomeTier} Income: ${customer.revenueWeightedSEI} SEI, ${customer.totalSpent} spent, ${customer.productsBought} products`
  ).join('\n');
  
  return `Analyze customer efficiency profiles and provide 2-3 strategic recommendations for customer development and personalization.

TOP CUSTOMERS BY EFFICIENCY:
${topCustomersList}

CUSTOMER BASE INSIGHTS:
- Average customer SEI: ${avgSEI.toFixed(1)}
- Multi-product customers: ${multiProductCustomers}/${profileData.length} (${((multiProductCustomers/profileData.length)*100).toFixed(1)}%)
- Total customers analyzed: ${profileData.length}

Focus on high-value customer retention strategies, personalized catalog development, converting single-product buyers to multi-product customers, and customer segmentation for premium offerings. Do not include phrases like 'would you like me to elaborate' or 'here are my recommendations'. Write as a business analyst delivering findings, not as a conversational assistant.`;
}

function createLegacyPrompt(insightSummaries: any): string {
  return `
    You are a catalog merchandising expert analyzing SQINCH (square inch) performance data. Based on the following analysis results, provide 3-4 key strategic insights that are immediately actionable for catalog optimization.

    SEGMENT ANALYSIS:
    - Top performing segment: ${insightSummaries.segmentInsights.topSegment?.segment} (${insightSummaries.segmentInsights.topSegment?.revenuePerSqIn}/sq inch)
    - Highest efficiency segment: ${insightSummaries.segmentInsights.highestEfficiencySegment?.segment} (${insightSummaries.segmentInsights.highestEfficiencySegment?.weightedAvgSEI} SEI)
    - Lowest performing segment: ${insightSummaries.segmentInsights.bottomSegment?.segment} (${insightSummaries.segmentInsights.bottomSegment?.revenuePerSqIn}/sq inch)

    PRODUCT AFFINITY:
    - Best product combination: ${insightSummaries.affinityInsights.topAffinity?.anchorProduct} + ${insightSummaries.affinityInsights.topAffinity?.boughtWithProduct} (${insightSummaries.affinityInsights.topAffinity?.combinedEfficiency} combined efficiency)
    - High-efficiency pairs found: ${insightSummaries.affinityInsights.highEfficiencyPairs}/${insightSummaries.affinityInsights.totalAffinityPairs}

    CUSTOMER INSIGHTS:
    - Top customer efficiency: ${insightSummaries.customerInsights.topCustomer?.revenueWeightedSEI} SEI
    - Average customer efficiency: ${Math.round(insightSummaries.customerInsights.avgCustomerSEI * 10) / 10} SEI  
    - Multi-product customers: ${insightSummaries.customerInsights.multiProductCustomers}/${insightSummaries.customerInsights.totalCustomers}

    Please provide insights in this format:
    **[Insight Category]**: [Specific finding and actionable recommendation]

    Focus on space reallocation, customer targeting, and product placement strategies. Do not include phrases like 'would you like me to elaborate' or 'here are my recommendations'. Write as a business analyst delivering findings, not as a conversational assistant.
    `;
}