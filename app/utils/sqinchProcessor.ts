// utils/sqinchProcessor.ts
import Papa from 'papaparse';
import _ from 'lodash';

export interface ProductRecord {
  'Product Name': string;
  'Product Sales Revenue': number;
  'Units Sold': number;
  'Square Inches': number;
  'Page Number': number;
  'Catalog Price': number;
}

export interface CustomerRecord {
  'Customer Email': string;
  'Product Name': string;
  'Units Purchased': number;
  'Revenue Generated': number;
  'Age Range': string;
  'Income Tier': string;
  'Location': string;
}

export interface EnrichedProduct extends ProductRecord {
  revenuePerSqIn: number;
  spaceEfficiencyIndex: number;
  catalogAvgRevenuePerSqIn: number;
  pageAvgRevenuePerSqIn: number;
  pagePositionRatio: number;
}

export interface SegmentAnalysis {
  segment: string;
  customers: number;
  totalRevenue: number;
  weightedAvgSEI: number;
  spaceConsumed: number;
  revenuePerSqIn: number;
}

export interface AffinityAnalysis {
  anchorProduct: string;
  anchorSEI: number;
  boughtWithProduct: string;
  boughtWithSEI: number;
  coPurchases: number;
  combinedEfficiency: number;
}

export interface CustomerProfile {
  customerEmail: string;
  ageRange: string;
  incomeTier: string;
  productsBought: number;
  totalSpent: number;
  avgSEI: number;
  revenueWeightedSEI: number;
}

export interface ProcessingResults {
  success: boolean;
  data?: {
    productMetrics: EnrichedProduct[];
    segmentAnalysis: SegmentAnalysis[];
    affinityAnalysis: AffinityAnalysis[];
    customerProfiles: CustomerProfile[];
    insightSummaries: any;
  };
  error?: string;
}

export function loadDatasets(productFile: string, customerFile: string) {
  const productData = Papa.parse(productFile, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true
  }).data as ProductRecord[];
  
  const customerData = Papa.parse(customerFile, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true
  }).data as CustomerRecord[];
  
  return { productData, customerData };
}

export function calculateProductMetrics(productData: ProductRecord[]): EnrichedProduct[] {
  const totalRevenue = _.sumBy(productData, 'Product Sales Revenue');
  const totalSquareInches = _.sumBy(productData, 'Square Inches');
  const catalogAvgRevenuePerSqIn = totalRevenue / totalSquareInches;
  
  const enrichedProducts = productData.map(product => {
    const revenuePerSqIn = product['Product Sales Revenue'] / product['Square Inches'];
    const spaceEfficiencyIndex = (revenuePerSqIn / catalogAvgRevenuePerSqIn) * 100;
    
    return {
      ...product,
      revenuePerSqIn,
      spaceEfficiencyIndex,
      catalogAvgRevenuePerSqIn,
      pageAvgRevenuePerSqIn: 0, // Will be calculated in next step
      pagePositionRatio: 0 // Will be calculated in next step
    };
  });
  
  return enrichedProducts;
}

export function calculatePageMetrics(enrichedProducts: EnrichedProduct[]): EnrichedProduct[] {
  const pageGroups = _.groupBy(enrichedProducts, 'Page Number');
  
  const pageMetrics = _.mapValues(pageGroups, (productsOnPage) => {
    const totalPageRevenue = _.sumBy(productsOnPage, 'Product Sales Revenue');
    const totalPageSquareInches = _.sumBy(productsOnPage, 'Square Inches');
    return {
      pageAvgRevenuePerSqIn: totalPageRevenue / totalPageSquareInches,
      productCount: productsOnPage.length
    };
  });
  
  return enrichedProducts.map(product => ({
    ...product,
    pageAvgRevenuePerSqIn: pageMetrics[product['Page Number']].pageAvgRevenuePerSqIn,
    pagePositionRatio: product.revenuePerSqIn / pageMetrics[product['Page Number']].pageAvgRevenuePerSqIn
  }));
}

export function generateSegmentAnalysis(
  customerData: CustomerRecord[], 
  productMetrics: EnrichedProduct[]
): SegmentAnalysis[] {
  const customerProductJoined = customerData.map(customerRecord => {
    const productMatch = productMetrics.find(p => p['Product Name'] === customerRecord['Product Name']);
    if (!productMatch) return null;
    return {
      ...customerRecord,
      spaceEfficiencyIndex: productMatch.spaceEfficiencyIndex,
      'Square Inches': productMatch['Square Inches']
    };
  }).filter((record): record is NonNullable<typeof record> => record !== null);
  
  const segmentedData = customerProductJoined.map(record => ({
    ...record,
    segment: `${record['Income Tier']} Income ${record.Location}`
  }));
  
  const segmentGroups = _.groupBy(segmentedData, 'segment');
  
  const segmentAnalysis = _.map(segmentGroups, (records, segment) => {
    const uniqueCustomers = _.uniqBy(records, 'Customer Email').length;
    const totalRevenue = _.sumBy(records, 'Revenue Generated');
    const totalSpaceConsumed = _.sumBy(records, record => 
      record['Units Purchased'] * record['Square Inches']
    );
    
    const weightedSEI = _.sumBy(records, record => 
      record['Revenue Generated'] * record.spaceEfficiencyIndex
    ) / totalRevenue;
    
    return {
      segment,
      customers: uniqueCustomers,
      totalRevenue,
      weightedAvgSEI: Math.round(weightedSEI * 10) / 10,
      spaceConsumed: totalSpaceConsumed,
      revenuePerSqIn: Math.round((totalRevenue / totalSpaceConsumed) * 100) / 100
    };
  });
  
  return _.orderBy(segmentAnalysis, 'revenuePerSqIn', 'desc');
}

export function generateAffinityAnalysis(
  customerData: CustomerRecord[], 
  productMetrics: EnrichedProduct[]
): AffinityAnalysis[] {
  const customerGroups = _.groupBy(customerData, 'Customer Email');
  
  const coPurchases: { customer: string; product1: string; product2: string; }[] = [];
  
  _.forEach(customerGroups, (purchases, customerEmail) => {
    if (purchases.length > 1) {
      for (let i = 0; i < purchases.length; i++) {
        for (let j = i + 1; j < purchases.length; j++) {
          const product1 = purchases[i]['Product Name'];
          const product2 = purchases[j]['Product Name'];
          
          coPurchases.push({
            customer: customerEmail,
            product1,
            product2
          });
        }
      }
    }
  });
  
  const affinityGroups = _.groupBy(coPurchases, record => 
    [record.product1, record.product2].sort().join(' + ')
  );
  
  const affinityAnalysis = _.map(affinityGroups, (records, productPair) => {
    const [product1, product2] = productPair.split(' + ');
    const product1Metrics = productMetrics.find(p => p['Product Name'] === product1);
    const product2Metrics = productMetrics.find(p => p['Product Name'] === product2);
    
    if (!product1Metrics || !product2Metrics) return null;
    
    return {
      anchorProduct: product1,
      anchorSEI: Math.round(product1Metrics.spaceEfficiencyIndex * 10) / 10,
      boughtWithProduct: product2,
      boughtWithSEI: Math.round(product2Metrics.spaceEfficiencyIndex * 10) / 10,
      coPurchases: records.length,
      combinedEfficiency: Math.round((product1Metrics.spaceEfficiencyIndex + product2Metrics.spaceEfficiencyIndex) / 2 * 10) / 10
    };
  }).filter((item): item is AffinityAnalysis => item !== null);
  
  return _.orderBy(affinityAnalysis, 'combinedEfficiency', 'desc');
}

export function generateCustomerProfiles(
  customerData: CustomerRecord[], 
  productMetrics: EnrichedProduct[]
): CustomerProfile[] {
  const enrichedCustomerData = customerData.map(record => {
    const productMatch = productMetrics.find(p => p['Product Name'] === record['Product Name']);
    if (!productMatch) return null;
    return { 
      ...record, 
      spaceEfficiencyIndex: productMatch.spaceEfficiencyIndex 
    };
  }).filter((record): record is NonNullable<typeof record> => record !== null);
  
  const customerGroups = _.groupBy(enrichedCustomerData, 'Customer Email');
  
  const customerProfiles = _.map(customerGroups, (purchases, customerEmail) => {
    const totalSpent = _.sumBy(purchases, 'Revenue Generated');
    const productsCount = purchases.length;
    
    const avgSEI = _.meanBy(purchases, 'spaceEfficiencyIndex');
    
    const revenueWeightedSEI = _.sumBy(purchases, purchase => 
      purchase['Revenue Generated'] * purchase.spaceEfficiencyIndex
    ) / totalSpent;
    
    const customerInfo = purchases[0];
    
    return {
      customerEmail,
      ageRange: customerInfo['Age Range'],
      incomeTier: customerInfo['Income Tier'],
      productsBought: productsCount,
      totalSpent,
      avgSEI: Math.round(avgSEI * 10) / 10,
      revenueWeightedSEI: Math.round(revenueWeightedSEI * 10) / 10
    };
  });
  
  return _.orderBy(customerProfiles, 'revenueWeightedSEI', 'desc');
}

export function generateInsightSummaries(
  segmentAnalysis: SegmentAnalysis[], 
  affinityAnalysis: AffinityAnalysis[], 
  customerProfiles: CustomerProfile[]
) {
  const insights = {
    segmentInsights: {
      topSegment: segmentAnalysis[0],
      bottomSegment: segmentAnalysis[segmentAnalysis.length - 1],
      highestEfficiencySegment: _.maxBy(segmentAnalysis, 'weightedAvgSEI'),
      totalSegments: segmentAnalysis.length
    },
    
    affinityInsights: {
      topAffinity: affinityAnalysis[0],
      totalAffinityPairs: affinityAnalysis.length,
      highEfficiencyPairs: affinityAnalysis.filter(pair => pair.combinedEfficiency > 150).length
    },
    
    customerInsights: {
      topCustomer: customerProfiles[0],
      avgCustomerSEI: _.meanBy(customerProfiles, 'avgSEI'),
      multiProductCustomers: customerProfiles.filter(c => c.productsBought > 1).length,
      totalCustomers: customerProfiles.length
    }
  };
  
  return insights;
}

export function processFullAnalysis(productFile: string, customerFile: string): ProcessingResults {
  try {
    const { productData, customerData } = loadDatasets(productFile, customerFile);
    
    const productMetrics = calculateProductMetrics(productData);
    const enrichedProducts = calculatePageMetrics(productMetrics);
    
    const segmentAnalysis = generateSegmentAnalysis(customerData, enrichedProducts);
    const affinityAnalysis = generateAffinityAnalysis(customerData, enrichedProducts);
    const customerProfiles = generateCustomerProfiles(customerData, enrichedProducts);
    
    const insightSummaries = generateInsightSummaries(segmentAnalysis, affinityAnalysis, customerProfiles);
    
    return {
      success: true,
      data: {
        productMetrics: enrichedProducts,
        segmentAnalysis,
        affinityAnalysis,
        customerProfiles,
        insightSummaries
      }
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export function exportToCsv(analysisData: any[], analysisType: string) {
  const csvData = Papa.unparse(analysisData);
  const blob = new Blob([csvData], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `sqinch_${analysisType}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  
  window.URL.revokeObjectURL(url);
}