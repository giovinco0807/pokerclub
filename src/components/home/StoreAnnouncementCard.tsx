import React from 'react';
import { StoreAnnouncement } from '../../types';
import Button from '../common/Button';

interface StoreAnnouncementCardProps {
  announcement: StoreAnnouncement | null;
}

const StoreAnnouncementCard: React.FC<StoreAnnouncementCardProps> = ({ announcement }) => {
  if (!announcement) {
    return (
      <div className="bg-neutral p-6 rounded-lg shadow-xl h-full flex flex-col justify-center items-center">
        <p className="text-neutral-light">現在お知らせはありません。</p>
      </div>
    );
  }

  const { title, text, imageUrl, link, createdAt } = announcement;

  return (
    <div className="bg-neutral p-6 rounded-lg shadow-xl h-full flex flex-col">
      <h3 className="text-xl font-semibold text-secondary mb-3">{title}</h3>
      
      {imageUrl && (
        <div className="mb-3 rounded-md overflow-hidden">
          <img 
            src={imageUrl} 
            alt={title} 
            className="w-full h-48 object-cover transition-transform duration-300 hover:scale-105"
          />
        </div>
      )}

      {text && (
        <p className="text-neutral-lightest text-sm mb-3 flex-grow whitespace-pre-line">
          {text}
        </p>
      )}
      
      {!imageUrl && !text && (
         <p className="text-neutral-light text-sm mb-3 flex-grow">
            詳細については、店内スタッフにお声掛けください。
        </p>
      )}

      <div className="mt-auto">
        {link && link !== '#' && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => window.open(link, '_blank')}
            className="w-full mb-2"
          >
            詳細はこちら
          </Button>
        )}
        <p className="text-xs text-neutral-light text-right">
          投稿日: {new Date(createdAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
};

export default StoreAnnouncementCard;