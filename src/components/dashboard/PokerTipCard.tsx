
import React, { useState, useEffect } from 'react';
import { fetchPokerTip } from '../../services/geminiService';

const PokerTipCard: React.FC = () => {
  const [tip, setTip] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const getTip = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const fetchedTip = await fetchPokerTip();
        setTip(fetchedTip);
      } catch (e: any) {
        // The fetchPokerTip function itself should return user-friendly error messages.
        // This catch is more for unexpected issues in the promise chain itself.
        console.error("PokerTipCard: Error invoking fetchPokerTip", e);
        setError(e.message || 'ポーカー豆知識の読み込み中に不明なエラーが発生しました。');
        setTip(''); 
      } finally {
        setIsLoading(false);
      }
    };

    getTip();
  }, []);

  return (
    <div className="bg-neutral p-6 rounded-lg shadow-xl h-full flex flex-col">
      <h3 className="text-xl font-semibold text-secondary mb-3">今日のポーカー豆知識 <span role="img" aria-label="light-bulb">💡</span></h3>
      {isLoading && (
        <div className="flex-grow flex items-center justify-center">
          <p className="text-neutral-lightest animate-pulse">豆知識を読み込み中...</p>
        </div>
      )}
      {!isLoading && error && (
        <div className="flex-grow flex items-center justify-center bg-red-800 bg-opacity-30 p-3 rounded-md">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}
      {/* Display the tip if not loading, no error, and tip is a non-empty string that implies success from fetchPokerTip */}
      {/* fetchPokerTip returns error messages as strings, so we need to distinguish them if needed, or just display what's returned. */}
      {/* Assuming fetchPokerTip returns a useful string whether it's a tip or an error message. */}
      {!isLoading && !error && tip && (
         <div className="flex-grow">
          <p className="text-neutral-lightest text-sm whitespace-pre-line">{tip}</p>
        </div>
      )}
      {/* This case might be redundant if tip always contains either the tip or an error message from fetchPokerTip */}
      {!isLoading && !error && !tip && (
         <div className="flex-grow flex items-center justify-center">
            <p className="text-neutral-light">豆知識の情報がありません。</p>
        </div>
      )}
      <p className="text-xs text-neutral-light mt-3 pt-3 border-t border-neutral-light">
        提供：Gemini API
      </p>
    </div>
  );
};

export default PokerTipCard;
