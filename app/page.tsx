"use client";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk"
import { useEffect, useState } from "react";
import { gql, ApolloClient, InMemoryCache, ApolloProvider, useQuery } from "@apollo/client";

// You can use AptosConfig to choose which network to connect to
const config = new AptosConfig({ network: Network.TESTNET });
// Aptos is the main entrypoint for all functions
const aptos = new Aptos(config);

// Set up Apollo Client
const client = new ApolloClient({
  uri: 'https://api.testnet.aptoslabs.com/v1/graphql', // Aptos testnet GraphQL endpoint
  cache: new InMemoryCache(),
});



// GraphQL query with pagination support
const GET_ACCOUNT_TRANSACTIONS = gql`
  query GetAccountTransactionsData($address: String!, $limit: Int!, $offset: Int!) {
    account_transactions(
      where: { account_address: { _eq: $address } }
      order_by: { transaction_version: desc }
      limit: $limit
      offset: $offset
    ) {
      transaction_version
      __typename
      user_transaction {
        sender
      }
    }
  }
`;

// GraphQL query to get coin balances with metadata
const GET_ACCOUNT_COINS = gql`
  query GetAccountCoins($address: String!) {
    current_coin_balances(
      where: { owner_address: { _eq: $address }, amount: { _gt: "0" } }
      order_by: { amount: desc }
    ) {
      amount
      coin_type
      coin_info {
        name
        symbol
        decimals
      }
    }
  }
`;
async function getTransactionSender(version: number): Promise<string | null> {
  const url = `https://fullnode.testnet.aptoslabs.com/v1/transactions/by_version/${version}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }

    const json = await response.json();
    return json.sender || null;
  } catch (error) {
    console.error("Error fetching transaction sender:", error);
    return null;
  }
}

// Alternative function to get transactions via REST API with larger limits
async function getAccountTransactionsRest(address: string, start?: number): Promise<any[]> {
  const url = `https://fullnode.testnet.aptoslabs.com/v1/accounts/${address}/transactions`;
  const params = new URLSearchParams({
    limit: "1000000", // REST API often allows higher limits
  });
  
  // Add start parameter if provided
  if (start !== undefined) {
    params.append("start", start.toString());
  }
  
  try {
    const response = await fetch(`${url}?${params}`);
    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }
    
    const transactions = await response.json();
    return Array.isArray(transactions) ? transactions : [];
  } catch (error) {
    console.error("Error fetching transactions via REST:", error);
    return [];
  }
}




// Component to fetch and display transactions
function AccountTransactions({ address }: { address: string }) {
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [useRestAPI, setUseRestAPI] = useState(false);
  const [restStartVersion, setRestStartVersion] = useState<number | undefined>();
  const pageSize = 100; // Fetch 100 transactions per page

  const { loading, error, data, fetchMore } = useQuery(GET_ACCOUNT_TRANSACTIONS, {
    variables: { address, limit: pageSize, offset: 0 },
    client: client,
    notifyOnNetworkStatusChange: true,
    skip: useRestAPI, // Skip GraphQL when using REST API
    onCompleted: (data) => {
      if (data?.account_transactions) {
        setAllTransactions(data.account_transactions);
        setHasMore(data.account_transactions.length === pageSize);
      }
    }
  });

  const loadMoreWithRest = async () => {
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    
    try {
      const restTransactions = await getAccountTransactionsRest(address, restStartVersion);
      
      if (restTransactions.length > 0) {
        // Convert REST API format to match GraphQL format for consistency
        const formattedTransactions = restTransactions.map(tx => ({
          transaction_version: tx.version,
          __typename: tx.type === "user_transaction" ? "UserTransaction" : "SystemTransaction", 
          user_transaction: tx.type === "user_transaction" ? { sender: tx.sender } : null
        }));
        
        setAllTransactions(prev => [...prev, ...formattedTransactions]);
        
        // Set the start version for next REST call (oldest transaction version - 1)
        const oldestVersion = Math.min(...restTransactions.map(tx => parseInt(tx.version)));
        setRestStartVersion(oldestVersion - 1);
        
        // Check if we got less than requested (indicates end)
        setHasMore(restTransactions.length >= 1000);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error loading more transactions via REST:', error);
      setHasMore(false);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const loadMoreWithGraphQL = async () => {
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    const nextOffset = (currentPage + 1) * pageSize;
    
    try {
      const result = await fetchMore({
        variables: {
          address,
          limit: pageSize,
          offset: nextOffset
        }
      });

      const newTransactions = result.data?.account_transactions || [];
      
      if (newTransactions.length > 0) {
        setAllTransactions(prev => [...prev, ...newTransactions]);
        setCurrentPage(prev => prev + 1);
        setHasMore(newTransactions.length === pageSize);
      } else {
        // GraphQL hit its limit, switch to REST API
        console.log("GraphQL pagination exhausted, switching to REST API...");
        setUseRestAPI(true);
        
        // Set starting point for REST API (use the oldest transaction version we have)
        if (allTransactions.length > 0) {
          const oldestVersion = Math.min(...allTransactions.map(tx => parseInt(tx.transaction_version)));
          setRestStartVersion(oldestVersion - 1);
        }
        
        setHasMore(true); // Give REST API a chance
      }
    } catch (error) {
      console.error('Error loading more transactions:', error);
      // Try switching to REST API on GraphQL error
      setUseRestAPI(true);
      setHasMore(true);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const loadMoreTransactions = () => {
    if (useRestAPI) {
      loadMoreWithRest();
    } else {
      loadMoreWithGraphQL();
    }
  };

  // Reset when address changes
  useEffect(() => {
    setAllTransactions([]);
    setCurrentPage(0);
    setHasMore(true);
    setUseRestAPI(false);
    setRestStartVersion(undefined);
  }, [address]);

  if (loading && allTransactions.length === 0) return (
    <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-12 text-center shadow-2xl">
      <div className="animate-pulse">
        <div className="h-6 bg-gradient-to-r from-cyan-400/30 to-purple-400/30 rounded-xl w-1/3 mx-auto mb-6"></div>
        <div className="space-y-4">
          <div className="h-24 bg-white/10 rounded-xl"></div>
          <div className="h-24 bg-white/10 rounded-xl"></div>
          <div className="h-24 bg-white/10 rounded-xl"></div>
        </div>
      </div>
      <p className="mt-6 text-gray-300 text-lg">Loading transactions...</p>
    </div>
  );
  
  if (error && !useRestAPI) return (
    <div className="backdrop-blur-xl bg-red-500/20 border border-red-400/30 rounded-2xl p-6 shadow-2xl">
      <div className="flex items-center mb-4">
        <div className="w-8 h-8 bg-red-500/30 rounded-lg mr-3 flex items-center justify-center">
          <svg className="w-5 h-5 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-red-300">Error Loading Transactions</h3>
      </div>
      <p className="text-red-200 mb-4">{error.message}</p>
      <button 
        onClick={() => setUseRestAPI(true)}
        className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl hover:from-cyan-600 hover:to-blue-600 transition-all font-semibold shadow-lg hover:shadow-cyan-500/25 hover:scale-105 transform"
      >
        Try REST API instead
      </button>
    </div>
  );

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6 text-white flex items-center">
        <div className="w-8 h-8 bg-gradient-to-r from-orange-400 to-red-400 rounded-xl mr-3 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        Transaction History
      </h2>
      {allTransactions.length > 0 ? (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 backdrop-blur-sm rounded-xl p-6 border border-blue-400/30">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Loaded Transactions: <span className="text-cyan-400">{allTransactions.length}</span>
                </h3>
                <p className="text-sm text-gray-300">
                  Using: <span className="text-cyan-400 font-medium">{useRestAPI ? "REST API (Higher Limits)" : "GraphQL API"}</span>
                </p>
              </div>
              {hasMore && (
                <button
                  onClick={loadMoreTransactions}
                  disabled={isLoadingMore}
                  className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl hover:from-cyan-600 hover:to-blue-600 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed transition-all font-semibold shadow-lg hover:shadow-cyan-500/25 hover:scale-105 transform"
                >
                  {isLoadingMore ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Loading...
                    </div>
                  ) : `Load More (${useRestAPI ? '1000' : '100'})`}
                </button>
              )}
            </div>
            {!hasMore && allTransactions.length > pageSize && (
              <p className="text-sm text-green-300 mt-3 bg-green-500/20 rounded-lg px-3 py-1 inline-block">
                ✅ All available transactions loaded
              </p>
            )}
          </div>
          
          <div className="space-y-4 max-h-96 overflow-y-auto custom-scrollbar">
            {allTransactions.map((transaction: any, index: number) => (
              <div 
                key={`${transaction.transaction_version}-${index}`} 
                onClick={() => {
                  const explorerUrl = `https://explorer.aptoslabs.com/txn/${transaction.transaction_version}?network=testnet`;
                  window.open(explorerUrl, '_blank');
                }}
                className="group bg-gradient-to-r from-white/10 to-white/5 backdrop-blur-sm border border-white/20 rounded-xl p-6 hover:border-orange-400/50 transition-all duration-300 hover:scale-[1.02] cursor-pointer relative"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl"></div>
                
                {/* External Link Icon */}
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-8 h-8 bg-orange-500/20 backdrop-blur-sm rounded-lg flex items-center justify-center border border-orange-400/30">
                    <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </div>
                </div>

                <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-4 pr-12">
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Transaction Version</p>
                    <p className="font-mono text-lg font-semibold text-cyan-400">{transaction.transaction_version}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Type</p>
                    <p className="font-semibold text-white">{transaction.__typename}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Direction</p>
                    <span className={`inline-flex px-3 py-1 rounded-lg text-sm font-semibold ${
                      address === transaction.user_transaction?.sender
                        ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                        : 'bg-green-500/20 text-green-300 border border-green-500/30'
                    }`}>
                      {address === transaction.user_transaction?.sender ? "📤 Send" : "📥 Receive"}
                    </span>
                  </div>
                </div>
                
                {/* Click to explore hint */}
                <div className="mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-xs text-orange-300 flex items-center">
                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Click to view transaction details
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Info message about transaction explorer links */}
          <div className="mt-6 p-4 bg-orange-500/10 backdrop-blur-sm rounded-xl border border-orange-400/20">
            <div className="flex items-center text-orange-300 text-sm">
              <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Click on any transaction to view detailed information on the official Aptos Explorer</span>
            </div>
          </div>

          {/* Load More Button at Bottom */}
          {hasMore && (
            <div className="text-center pt-6">
              <button
                onClick={loadMoreTransactions}
                disabled={isLoadingMore}
                className="px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed transition-all font-semibold shadow-lg hover:shadow-purple-500/25 hover:scale-105 transform"
              >
                {isLoadingMore ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                    Loading More...
                  </div>
                ) : `Load More Transactions (${allTransactions.length}+ loaded) - ${useRestAPI ? 'REST API' : 'GraphQL'}`}
              </button>
              {!useRestAPI && allTransactions.length >= 1000 && (
                <p className="text-sm text-yellow-300 mt-3 bg-yellow-500/20 rounded-lg px-4 py-2 inline-block border border-yellow-500/30">
                  ⚡ Approaching GraphQL limits. Will switch to REST API for more transactions.
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 bg-gradient-to-br from-gray-500/20 to-gray-600/20 backdrop-blur-sm rounded-xl border border-gray-400/30">
          <div className="w-16 h-16 bg-gradient-to-r from-gray-400 to-gray-600 rounded-2xl mx-auto mb-6 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No Transactions Found</h3>
          <p className="text-gray-400">This address has no transaction history available.</p>
        </div>
      )}
    </div>
  );
}



export default function Home() {
  const [accountData, setAccountData] = useState<any>(null);
  const [address, setAddress] = useState<string>("0x1b63ce396e7dab07adf55a93721de8e4a134dcaa059f0e81f47b2009e7670b8e");
  const [inputAddress, setInputAddress] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyToast(`${label} copied to clipboard!`);
      setTimeout(() => setCopyToast(null), 2000);
    }).catch(() => {
      setCopyToast('Failed to copy');
      setTimeout(() => setCopyToast(null), 2000);
    });
  };

  const fetchAccountData = async (targetAddress: string) => {
    if (!targetAddress || targetAddress.trim() === "") {
      return;
    }
    
    setLoading(true);
    setAccountData(null);
    
    try {
      // Sequence number: number of sent transactions
      const fund = await aptos.getAccountInfo({ accountAddress: targetAddress });
      const modules = await aptos.getAccountModules({ accountAddress: targetAddress });
      
      // Get ALL coin data (including zero balances)
      const allCoinData = await aptos.getAccountCoinsData({ 
        accountAddress: targetAddress, 
        options: {
          limit: 1000, // Increase limit to get more assets
          orderBy: [{ amount: "desc" }], // Order by highest balance first
        } 
      });

      // APT Balance specifically
      const coinCounts = await aptos.getAccountCoinAmount({ 
        accountAddress: targetAddress,  
        coinType: "0x1::aptos_coin::AptosCoin" 
      });

      // Get NFT data
      let nftData: any[] = [];
      try {
        nftData = await aptos.getAccountOwnedTokens({ 
          accountAddress: targetAddress,
          options: {
            limit: 50,
          }
        });
      } catch (error) {
        console.log("No NFTs or error fetching NFTs:", error);
      }

      // Filter coins with balance > 0
      const filteredCoinData = allCoinData.filter(coin => coin.amount > 0);
      
      setAccountData({
        fund, 
        modules, 
        coinCounts, 
        coinData: filteredCoinData,
        allCoinData, // Include all coin data for analysis
        nftData
      });
    } catch (error) {
      console.error("Error fetching account data:", error);
      setAccountData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleAddressSubmit = () => {
    if (inputAddress.trim()) {
      setAddress(inputAddress.trim());
      fetchAccountData(inputAddress.trim());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddressSubmit();
    }
  };

  useEffect(() => {
    // Load default address on component mount
    fetchAccountData(address);
  }, []);

  return (
    <ApolloProvider client={client}>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-700"></div>
          <div className="absolute top-40 left-1/2 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
        </div>
        
        <div className="relative z-10 p-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-6xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
              Aptos Explorer
            </h1>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Discover the future of blockchain with our advanced account explorer
            </p>
            <div className="mt-6 w-24 h-1 bg-gradient-to-r from-cyan-400 to-purple-400 mx-auto rounded-full"></div>
          </div>
          
          {/* Address Input Section */}
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-8 mb-8 shadow-2xl">
            <h2 className="text-2xl font-semibold mb-6 text-white flex items-center">
              <div className="w-8 h-8 bg-gradient-to-r from-cyan-400 to-purple-400 rounded-lg mr-3 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              Search Address
            </h2>
            <div className="flex gap-4">
              <input
                type="text"
                value={inputAddress}
                onChange={(e) => setInputAddress(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter Aptos address (0x...)"
                className="flex-1 px-6 py-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none transition-all backdrop-blur-sm"
              />
              <button
                onClick={handleAddressSubmit}
                disabled={loading || !inputAddress.trim()}
                className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-purple-500 text-white rounded-xl hover:from-cyan-600 hover:to-purple-600 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed transition-all font-semibold shadow-lg hover:shadow-cyan-500/25 hover:scale-105 transform"
              >
                {loading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Loading...
                  </div>
                ) : "Search"}
              </button>
            </div>
            {address && (
              <div className="mt-4 p-4 bg-black/20 rounded-xl border border-white/10">
                <p className="text-sm text-gray-300">
                  Current address: <span className="font-mono text-cyan-400 break-all">{address}</span>
                </p>
              </div>
            )}
          </div>

          {/* Account Data Section */}
          {loading ? (
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-12 text-center shadow-2xl">
              <div className="animate-pulse">
                <div className="h-6 bg-gradient-to-r from-cyan-400/30 to-purple-400/30 rounded-xl w-1/3 mx-auto mb-6"></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="h-32 bg-white/10 rounded-xl"></div>
                  <div className="h-32 bg-white/10 rounded-xl"></div>
                  <div className="h-32 bg-white/10 rounded-xl"></div>
                </div>
              </div>
              <p className="mt-6 text-gray-300 text-lg">Loading account data...</p>
            </div>
          ) : accountData ? (
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-8 mb-8 shadow-2xl">
              <h2 className="text-3xl font-semibold mb-8 text-white flex items-center">
                <div className="w-10 h-10 bg-gradient-to-r from-green-400 to-blue-400 rounded-xl mr-4 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                Account Overview
              </h2>
              
              {/* Account Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="group relative overflow-hidden bg-gradient-to-br from-blue-500/20 to-cyan-500/20 backdrop-blur-sm p-6 rounded-2xl border border-blue-400/30 hover:border-blue-400/50 transition-all duration-300 hover:scale-105">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <h3 className="font-semibold text-blue-300 mb-2 flex items-center">
                    <div className="w-8 h-8 bg-blue-500/30 rounded-lg mr-2 flex items-center justify-center">
                      <svg className="w-4 h-4 text-blue-300" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"></path>
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd"></path>
                      </svg>
                    </div>
                    APT Balance
                  </h3>
                  <p className="text-3xl font-bold text-white mb-1">
                    {(accountData.coinCounts / 10e7).toFixed(4)}
                  </p>
                  <p className="text-blue-300 text-sm">APT</p>
                </div>

                <div className="group relative overflow-hidden bg-gradient-to-br from-green-500/20 to-emerald-500/20 backdrop-blur-sm p-6 rounded-2xl border border-green-400/30 hover:border-green-400/50 transition-all duration-300 hover:scale-105">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <h3 className="font-semibold text-green-300 mb-2 flex items-center">
                    <div className="w-8 h-8 bg-green-500/30 rounded-lg mr-2 flex items-center justify-center">
                      <svg className="w-4 h-4 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                      </svg>
                    </div>
                    Transactions
                  </h3>
                  <p className="text-3xl font-bold text-white mb-1">
                    {accountData.fund?.sequence_number || '0'}
                  </p>
                  <p className="text-green-300 text-sm">Sent</p>
                </div>

                <div className="group relative overflow-hidden bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-sm p-6 rounded-2xl border border-purple-400/30 hover:border-purple-400/50 transition-all duration-300 hover:scale-105">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <h3 className="font-semibold text-purple-300 mb-2 flex items-center">
                    <div className="w-8 h-8 bg-purple-500/30 rounded-lg mr-2 flex items-center justify-center">
                      <svg className="w-4 h-4 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                      </svg>
                    </div>
                    Token Types
                  </h3>
                  <p className="text-3xl font-bold text-white mb-1">
                    {accountData.coinData?.length || 0}
                  </p>
                  <p className="text-purple-300 text-sm">Assets</p>
                </div>

                <div className="group relative overflow-hidden bg-gradient-to-br from-orange-500/20 to-red-500/20 backdrop-blur-sm p-6 rounded-2xl border border-orange-400/30 hover:border-orange-400/50 transition-all duration-300 hover:scale-105">
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <h3 className="font-semibold text-orange-300 mb-2 flex items-center">
                    <div className="w-8 h-8 bg-orange-500/30 rounded-lg mr-2 flex items-center justify-center">
                      <svg className="w-4 h-4 text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    </div>
                    NFTs
                  </h3>
                  <p className="text-3xl font-bold text-white mb-1">
                    {accountData.nftData?.length || 0}
                  </p>
                  <p className="text-orange-300 text-sm">Collectibles</p>
                </div>
              </div>

              {/* Assets Section */}
              {accountData.coinData && accountData.coinData.length > 0 && (
                <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-8 mb-8 shadow-2xl">
                  <h3 className="text-2xl font-semibold text-white mb-6 flex items-center">
                    <div className="w-8 h-8 bg-gradient-to-r from-green-400 to-blue-400 rounded-xl mr-3 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                      </svg>
                    </div>
                    Assets Portfolio
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {accountData.coinData.map((coin: any, index: number) => (
                      <div 
                        key={index} 
                        onClick={() => {
                          const explorerUrl = `https://explorer.aptoslabs.com/coin/${coin.asset_type}?network=testnet`;
                          window.open(explorerUrl, '_blank');
                        }}
                        className="group relative overflow-hidden bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm p-6 rounded-xl border border-white/20 hover:border-cyan-400/50 transition-all duration-300 hover:scale-105 cursor-pointer"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        
                        {/* External Link Icon */}
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-8 h-8 bg-cyan-500/20 backdrop-blur-sm rounded-lg flex items-center justify-center border border-cyan-400/30">
                            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </div>
                        </div>

                        <div className="relative z-10">
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex-1 min-w-0 pr-12">
                              <h4 className="font-semibold text-white text-lg mb-2">
                                {coin.asset_type?.split('::')[2] || 'Unknown Token'}
                              </h4>
                              <div className="flex items-center gap-2">
                                <p className="text-sm text-gray-300 truncate flex-1 min-w-0 font-mono" title={coin.asset_type}>
                                  {coin.asset_type?.slice(0, 20)}...{coin.asset_type?.slice(-6)}
                                </p>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation(); // Prevent card click when copying
                                    copyToClipboard(coin.asset_type, 'Asset address');
                                  }}
                                  className="flex-shrink-0 p-2 hover:bg-white/10 rounded-lg transition-colors group"
                                  title="Copy asset address"
                                >
                                  <svg 
                                    className="w-4 h-4 text-gray-300 hover:text-cyan-400 transition-colors" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    viewBox="0 0 24 24"
                                  >
                                    <path 
                                      strokeLinecap="round" 
                                      strokeLinejoin="round" 
                                      strokeWidth={2} 
                                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" 
                                    />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="text-2xl font-bold text-white">
                              {(coin.amount / Math.pow(10, coin.metadata?.decimals || 8)).toLocaleString()}
                            </p>
                            <p className="text-sm text-cyan-400 font-medium">
                              {coin.metadata?.symbol || 'N/A'}
                            </p>
                          </div>
                          
                          {/* Click to explore hint */}
                          <div className="mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-xs text-cyan-300 flex items-center">
                              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              Click to view on Aptos Explorer
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Info message about explorer links */}
                  <div className="mt-6 p-4 bg-cyan-500/10 backdrop-blur-sm rounded-xl border border-cyan-400/20">
                    <div className="flex items-center text-cyan-300 text-sm">
                      <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Click on any asset card to view detailed information on the official Aptos Explorer</span>
                    </div>
                  </div>
                </div>
              )}

              {/* NFTs Section */}
              {accountData.nftData && accountData.nftData.length > 0 && (
                <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-8 mb-8 shadow-2xl">
                  <h3 className="text-2xl font-semibold text-white mb-6 flex items-center">
                    <div className="w-8 h-8 bg-gradient-to-r from-pink-400 to-purple-400 rounded-xl mr-3 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    </div>
                    NFT Collection
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {accountData.nftData.slice(0, 8).map((nft: any, index: number) => (
                      <div 
                        key={index} 
                        onClick={() => {
                          // Use token_data_id for NFT explorer link
                          const tokenDataId = nft.current_token_data?.token_data_id || nft.token_data_id;
                          if (tokenDataId) {
                            const explorerUrl = `https://explorer.aptoslabs.com/token/${tokenDataId}?network=testnet`;
                            window.open(explorerUrl, '_blank');
                          }
                        }}
                        className="group relative overflow-hidden bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm p-4 rounded-xl border border-white/20 hover:border-pink-400/50 transition-all duration-300 hover:scale-105 cursor-pointer"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        
                        {/* External Link Icon */}
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-7 h-7 bg-pink-500/20 backdrop-blur-sm rounded-lg flex items-center justify-center border border-pink-400/30">
                            <svg className="w-3 h-3 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </div>
                        </div>

                        <div className="relative z-10">
                          <div className="aspect-square bg-black/20 backdrop-blur-sm rounded-xl mb-4 overflow-hidden border border-white/10">
                            {nft.current_token_data?.token_uri ? (
                              <img 
                                src={nft.current_token_data.token_uri} 
                                alt={nft.current_token_data?.token_name || 'NFT'}
                                className="w-full h-full object-cover hover:scale-110 transition-transform duration-300"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <div className="w-12 h-12 bg-gradient-to-r from-pink-400 to-purple-400 rounded-xl flex items-center justify-center">
                                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                </div>
                              </div>
                            )}
                          </div>
                          <h5 className="font-semibold text-white text-sm mb-1 truncate">
                            {nft.current_token_data?.token_name || 'Unnamed NFT'}
                          </h5>
                          <p className="text-xs text-gray-300 truncate mb-2">
                            {nft.current_token_data?.collection_name || 'Unknown Collection'}
                          </p>
                          
                          {/* Click to explore hint */}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-xs text-pink-300 flex items-center">
                              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              View NFT Details
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {accountData.nftData.length > 8 && (
                    <div className="mt-6 text-center">
                      <p className="text-sm text-gray-300 bg-black/20 backdrop-blur-sm rounded-lg px-4 py-2 inline-block border border-white/10">
                        Showing 8 of {accountData.nftData.length} NFTs
                      </p>
                    </div>
                  )}
                  
                  {/* Info message about NFT explorer links */}
                  <div className="mt-6 p-4 bg-pink-500/10 backdrop-blur-sm rounded-xl border border-pink-400/20">
                    <div className="flex items-center text-pink-300 text-sm">
                      <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Click on any NFT to view detailed token information on the official Aptos Explorer</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Raw Data Section */}
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-8 shadow-2xl">
                <details className="group">
                  <summary className="cursor-pointer font-semibold text-white hover:text-cyan-400 py-2 flex items-center transition-colors">
                    <div className="w-6 h-6 bg-gradient-to-r from-gray-400 to-gray-600 rounded-lg mr-3 flex items-center justify-center">
                      <svg className="w-4 h-4 text-white group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    View Raw Account Data
                  </summary>
                  <div className="mt-4 bg-black/30 backdrop-blur-sm p-6 rounded-xl border border-white/10 overflow-hidden">
                    <pre className="text-sm text-gray-300 overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
                      {JSON.stringify(accountData, null, 2)}
                    </pre>
                  </div>
                </details>
              </div>
            </div>
        ) : (
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-12 text-center shadow-2xl">
            <div className="w-16 h-16 bg-gradient-to-r from-gray-400 to-gray-600 rounded-2xl mx-auto mb-6 flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">Ready to Explore</h3>
            <p className="text-gray-300">Enter an Aptos address above to discover account information, assets, and transaction history</p>
          </div>
        )}

        {/* Transactions Section */}
        {address && (
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-8 shadow-2xl">
            <AccountTransactions address={address} />
          </div>
        )}

        {/* Toast Notification */}
        {copyToast && (
          <div className="fixed bottom-6 right-6 bg-gradient-to-r from-green-500 to-emerald-500 text-white px-6 py-3 rounded-xl shadow-2xl z-50 transition-all duration-300 transform hover:scale-105 backdrop-blur-sm border border-green-400/30">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {copyToast}
            </div>
          </div>
        )}
        </div>
      </div>
    </ApolloProvider>
  );
}
