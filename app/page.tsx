// app/page.tsx
'use client';

import { useState, useRef } from 'react';
import { processFullAnalysis, exportToCsv, ProcessingResults } from './utils/sqinchProcessor';

interface AnalysisData {
  productMetrics: any[];
  segmentAnalysis: any[];
  affinityAnalysis: any[];
  customerProfiles: any[];
  insightSummaries: any;
}

interface TabInsights {
  [key: string]: {
    content: string;
    loading: boolean;
  };
}

export default function Home() {
  const [results, setResults] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [tabInsights, setTabInsights] = useState<TabInsights>({});
  const [activeTab, setActiveTab] = useState('foundational');
  const [error, setError] = useState<string>('');
  const [showHelp, setShowHelp] = useState<string | null>(null);
  
  const productFileRef = useRef<HTMLInputElement>(null);
  const customerFileRef = useRef<HTMLInputElement>(null);

  const handleAnalysis = async () => {
    const productFile = productFileRef.current?.files?.[0];
    const customerFile = customerFileRef.current?.files?.[0];

    if (!productFile || !customerFile) {
      setError('Please select both CSV files');
      return;
    }

    setLoading(true);
    setError('');
    setTabInsights({}); // Clear previous insights

    try {
      // Read files as text
      const productText = await productFile.text();
      const customerText = await customerFile.text();

      // Process the analysis
      const analysisResults: ProcessingResults = processFullAnalysis(productText, customerText);

      if (analysisResults.success && analysisResults.data) {
        setResults(analysisResults.data);
        // Tab-specific insights will be loaded when each tab is viewed
      } else {
        setError(analysisResults.error || 'Analysis failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const loadTabInsights = async (tabId: string) => {
    if (!results || tabInsights[tabId]) return; // Skip if no results or already loaded

    // Set loading state
    setTabInsights(prev => ({
      ...prev,
      [tabId]: { content: '', loading: true }
    }));

    try {
      let requestData = {
        analysisType: tabId,
        insightSummaries: results.insightSummaries,
        data: getDataForTab(tabId)
      };

      const response = await fetch('/api/generate-insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      if (response.ok) {
        const insightData = await response.json();
        if (insightData.success) {
          setTabInsights(prev => ({
            ...prev,
            [tabId]: { content: insightData.insights, loading: false }
          }));
        } else {
          setTabInsights(prev => ({
            ...prev,
            [tabId]: { content: 'Failed to generate insights for this analysis.', loading: false }
          }));
        }
      }
    } catch (err) {
      setTabInsights(prev => ({
        ...prev,
        [tabId]: { content: 'Error loading insights.', loading: false }
      }));
    }
  };

  const getDataForTab = (tabId: string) => {
    if (!results) return [];
    
    switch (tabId) {
      case 'foundational':
        return results.productMetrics;
      case 'segment':
        return results.segmentAnalysis;
      case 'affinity':
        return results.affinityAnalysis;
      case 'profiles':
        return results.customerProfiles;
      default:
        return [];
    }
  };

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    if (results) {
      loadTabInsights(tabId);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatNumber = (num: number, decimals = 1) => {
    return Number(num).toFixed(decimals);
  };

  const parseMarkdown = (text: string) => {
  return text
    .replace(/### (.*?)(\n|$)/g, '<h3 class="text-lg font-semibold text-gray-900 mt-6 mb-3 flex items-center"><span class="w-2 h-2 bg-blue-600 rounded-full mr-3"></span>$1</h3>')
    .replace(/## (.*?)(\n|$)/g, '<h2 class="text-xl font-semibold text-gray-900 mt-8 mb-4 pb-2 border-b border-gray-200">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900 bg-yellow-50 px-1 py-0.5 rounded">$1</strong>')
    .replace(/(\d+)\.\s/g, '<div class="flex items-start mt-4"><span class="flex-shrink-0 w-6 h-6 bg-blue-600 text-white text-sm font-semibold rounded-full flex items-center justify-center mr-3 mt-0.5">$1</span><div>')
    .replace(/\n\n/g, '</div><br>')
    .replace(/\n/g, '<br>');
  };

  // Help content definitions
  const helpContent: Record<string, { title: string; description: string; interpretation: string }> = {
    'sei': {
      title: 'Space Efficiency Index (SEI)',
      description: 'Measures how much revenue a product generates per square inch relative to the catalog average.',
      interpretation: 'SEI of 100 = average performance. Above 120 = high efficiency (green). 100-120 = moderate (yellow). Below 100 = low efficiency (red).'
    },
    'revenuePerSqIn': {
      title: 'Revenue per Square Inch',
      description: 'Direct calculation of dollars generated divided by square inches of catalog space allocated.',
      interpretation: 'Higher values indicate better space utilization. Use to identify products that maximize return on catalog real estate.'
    },
    'pagePositionRatio': {
      title: 'Page Position Performance',
      description: 'Compares a product\'s performance to the average performance of all products on the same page.',
      interpretation: 'Ratio > 1.0 means the product outperforms its page location. Ratio < 1.0 suggests the product may be in a premium spot it doesn\'t deserve.'
    },
    'combinedEfficiency': {
      title: 'Combined Efficiency',
      description: 'Average of the Space Efficiency Index for two products that are frequently bought together.',
      interpretation: 'Higher values indicate product pairings that both perform well individually. Use for catalog layout decisions.'
    },
    'coPurchases': {
      title: 'Co-Purchases',
      description: 'Number of customers who bought both products in the same catalog cycle.',
      interpretation: 'Higher numbers indicate stronger product affinity. Consider placing these products near each other in the catalog.'
    },
    'weightedAvgSEI': {
      title: 'Weighted Average SEI',
      description: 'Customer segment\'s efficiency weighted by revenue contribution rather than simple average.',
      interpretation: 'Shows which customer segments are most valuable when considering both efficiency and spending power.'
    },
    'revenueWeightedSEI': {
      title: 'Revenue-Weighted SEI',
      description: 'Individual customer\'s space efficiency weighted by their total spending.',
      interpretation: 'Identifies customers who both spend well and buy space-efficient products. Target for premium catalog versions.'
    },
    'foundationalAnalysis': {
      title: 'Foundational Metrics Analysis',
      description: 'Core product performance measurements showing how efficiently each product uses catalog space.',
      interpretation: 'Start here to identify top and bottom performers. Products with high SEI deserve more space; low performers need repositioning or removal.'
    },
    'segmentAnalysis': {
      title: 'Customer Segment Analysis', 
      description: 'Groups customers by demographics to reveal which segments generate the most revenue per square inch of catalog space.',
      interpretation: 'Use to optimize circulation lists, create targeted catalog versions, and focus acquisition efforts on high-efficiency segments.'
    },
    'affinityAnalysis': {
      title: 'Product Affinity Analysis',
      description: 'Identifies products frequently bought together and measures their combined space efficiency.',
      interpretation: 'Optimize catalog layout by placing high-affinity products near each other. Create cross-selling opportunities and product bundles.'
    },
    'profilesAnalysis': {
      title: 'Customer Efficiency Profiles',
      description: 'Ranks individual customers by their space efficiency - those who buy high-performing products relative to space invested.',
      interpretation: 'Identify your most valuable customers for VIP treatment, personalized catalogs, and lookalike targeting for acquisition.'
    }
  };

  const HelpTooltip = ({ helpKey }: { helpKey: string }) => (
    <div className="relative inline-block">
      <button
        onClick={() => setShowHelp(showHelp === helpKey ? null : helpKey)}
        className="ml-1 text-gray-400 hover:text-gray-600 text-xs"
        title="Click for help"
      >
        ?
      </button>
      {showHelp === helpKey && (
        <div className="absolute z-50 w-80 p-4 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg">
          <h4 className="font-semibold text-gray-900 mb-2">{helpContent[helpKey]?.title}</h4>
          <p className="text-sm text-gray-700 mb-2">{helpContent[helpKey]?.description}</p>
          <p className="text-xs text-gray-600">{helpContent[helpKey]?.interpretation}</p>
          <button
            onClick={() => setShowHelp(null)}
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );

  const TabInsightsSection = ({ tabId }: { tabId: string }) => {
    const insights = tabInsights[tabId];
    
    if (!insights) {
      return (
        <div className="mb-6 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg shadow-sm">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
            <span className="text-blue-800 text-sm">Generating AI insights for this analysis...</span>
          </div>
        </div>
      );
    }

    if (insights.loading) {
      return (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
            <span className="text-blue-800 text-sm">Generating AI insights for this analysis...</span>
          </div>
        </div>
      );
    }

    return (
      <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg">
        <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
          Analysis - Insights - Recommendations
        </h4>
        <div 
          className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: parseMarkdown(insights.content) }}
        />
      </div>
    );
  };

  // Load insights for the active tab when results are available
  if (results && activeTab && !tabInsights[activeTab]) {
    loadTabInsights(activeTab);
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            SQINCH Analytics
          </h1>
          <p className="text-lg text-gray-600">
            Square Inch Analysis for Catalog Optimization
          </p>
        </div>

        {/* File Upload Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Upload Your Data
            </h2>
            <button
              onClick={() => setShowHelp(showHelp === 'methodology' ? null : 'methodology')}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              What is SQINCH Analysis?
            </button>
          </div>
          
          {showHelp === 'methodology' && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">SQINCH Methodology</h3>
              <p className="text-sm text-blue-800 mb-2">
                SQINCH (Square Inch) Analysis treats every square inch of catalog space as valuable real estate. 
                By measuring revenue generated per square inch, you can make data-driven decisions about product placement, 
                space allocation, and catalog optimization.
              </p>
              <p className="text-xs text-blue-700">
                The analysis combines product performance data with customer demographics to reveal which products, 
                customer segments, and product combinations deliver the highest return on catalog space investment.
              </p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Product Dataset (CSV)
              </label>
              <input
                ref={productFileRef}
                type="file"
                accept=".csv"
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              <p className="text-xs text-gray-500 mt-1">
                Product Name, Sales Revenue, Units Sold, Square Inches, Page Number, Catalog Price
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer Dataset (CSV)
              </label>
              <input
                ref={customerFileRef}
                type="file"
                accept=".csv"
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              <p className="text-xs text-gray-500 mt-1">
                Customer Email, Product Name, Units Purchased, Revenue Generated, Age Range, Income Tier, Location
              </p>
            </div>
          </div>
          
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <button
            onClick={handleAnalysis}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing Analysis...' : 'Run SQINCH Analysis'}
          </button>
        </div>

        {/* Results Section */}
        {results && (
          <div className="space-y-6">
            {/* Navigation Tabs */}
            <div className="bg-white rounded-lg shadow-md p-2">
              <nav className="flex space-x-1">
                {[
                  { id: 'foundational', label: 'Foundational Metrics' },
                  { id: 'segment', label: 'Customer Segments' },
                  { id: 'affinity', label: 'Product Affinity' },
                  { id: 'profiles', label: 'Customer Profiles' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Foundational Metrics Tab */}
            {activeTab === 'foundational' && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <TabInsightsSection tabId="foundational" />
                
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Product Performance Fundamentals
                    <HelpTooltip helpKey="foundationalAnalysis" />
                  </h3>
                  <button
                    onClick={() => exportToCsv(results.productMetrics, 'foundational-metrics')}
                    className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700"
                  >
                    Export CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full table-auto">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Product Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Revenue/Sq In
                          <HelpTooltip helpKey="revenuePerSqIn" />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Space Efficiency Index
                          <HelpTooltip helpKey="sei" />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Page Position Ratio
                          <HelpTooltip helpKey="pagePositionRatio" />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Page #
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {results.productMetrics
                        .sort((a, b) => b.spaceEfficiencyIndex - a.spaceEfficiencyIndex)
                        .map((product: any, index: number) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-4 text-sm font-medium text-gray-900">
                            {product['Product Name']}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            {formatCurrency(product.revenuePerSqIn)}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              product.spaceEfficiencyIndex > 120 ? 'bg-green-100 text-green-800' :
                              product.spaceEfficiencyIndex > 100 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {formatNumber(product.spaceEfficiencyIndex)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              product.pagePositionRatio > 1.2 ? 'bg-green-100 text-green-800' :
                              product.pagePositionRatio > 0.8 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {formatNumber(product.pagePositionRatio, 2)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            {product['Page Number']}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Segment Analysis Tab */}
            {activeTab === 'segment' && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <TabInsightsSection tabId="segment" />
                
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Customer Segment Performance
                    <HelpTooltip helpKey="segmentAnalysis" />
                  </h3>
                  <button
                    onClick={() => exportToCsv(results.segmentAnalysis, 'segment-analysis')}
                    className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700"
                  >
                    Export CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full table-auto">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Segment
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Customers
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Revenue
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Weighted Avg SEI
                          <HelpTooltip helpKey="weightedAvgSEI" />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Revenue/Sq In
                          <HelpTooltip helpKey="revenuePerSqIn" />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {results.segmentAnalysis.map((segment: any, index: number) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-4 text-sm font-medium text-gray-900">
                            {segment.segment}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            {segment.customers}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            {formatCurrency(segment.totalRevenue)}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              segment.weightedAvgSEI > 120 ? 'bg-green-100 text-green-800' :
                              segment.weightedAvgSEI > 100 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {formatNumber(segment.weightedAvgSEI)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            {formatCurrency(segment.revenuePerSqIn)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Product Affinity Tab */}
            {activeTab === 'affinity' && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <TabInsightsSection tabId="affinity" />
                
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Product Affinity Analysis
                    <HelpTooltip helpKey="affinityAnalysis" />
                  </h3>
                  <button
                    onClick={() => exportToCsv(results.affinityAnalysis, 'affinity-analysis')}
                    className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700"
                  >
                    Export CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full table-auto">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Anchor Product
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Bought With
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Co-Purchases
                          <HelpTooltip helpKey="coPurchases" />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Combined Efficiency
                          <HelpTooltip helpKey="combinedEfficiency" />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {results.affinityAnalysis.map((affinity: any, index: number) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-4 text-sm font-medium text-gray-900">
                            {affinity.anchorProduct}
                            <div className="text-xs text-gray-500">SEI: {formatNumber(affinity.anchorSEI)}</div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            {affinity.boughtWithProduct}
                            <div className="text-xs text-gray-500">SEI: {formatNumber(affinity.boughtWithSEI)}</div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            {affinity.coPurchases}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              affinity.combinedEfficiency > 200 ? 'bg-green-100 text-green-800' :
                              affinity.combinedEfficiency > 150 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {formatNumber(affinity.combinedEfficiency)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Customer Profiles Tab */}
            {activeTab === 'profiles' && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <TabInsightsSection tabId="profiles" />
                
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Customer Efficiency Profiles
                    <HelpTooltip helpKey="profilesAnalysis" />
                  </h3>
                  <button
                    onClick={() => exportToCsv(results.customerProfiles, 'customer-profiles')}
                    className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700"
                  >
                    Export CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full table-auto">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Customer
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Demographics
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Products Bought
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Spent
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Revenue-Weighted SEI
                          <HelpTooltip helpKey="revenueWeightedSEI" />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {results.customerProfiles.slice(0, 20).map((profile: any, index: number) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-4 text-sm font-medium text-gray-900">
                            {profile.customerEmail}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            <div>{profile.ageRange}</div>
                            <div className="text-xs text-gray-400">{profile.incomeTier} Income</div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            {profile.productsBought}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            {formatCurrency(profile.totalSpent)}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              profile.revenueWeightedSEI > 200 ? 'bg-green-100 text-green-800' :
                              profile.revenueWeightedSEI > 120 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {formatNumber(profile.revenueWeightedSEI)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {results.customerProfiles.length > 20 && (
                  <div className="mt-4 text-sm text-gray-500 text-center">
                    Showing top 20 customers. Export CSV for complete list.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            SQINCH Analytics - Optimize your catalog space allocation with data-driven insights
          </p>
        </div>
      </div>
    </div>
  );
}