// src/pages/CheckinListPage.tsx
import React, { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';

interface CheckinRecord {
  uid: string;
  tableId: string;
  checkInAt: string;
  checkOutAt: string | null;
  bill: number | null;
  status: string;
}

const CheckinListPage: React.FC = () => {
  const [records, setRecords] = useState<CheckinRecord[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const q = query(collection(db, 'checkins'), orderBy('checkInAt', 'desc'));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          uid: data.uid,
          tableId: data.tableId,
          checkInAt: data.checkInAt.toDate().toLocaleString(),
          checkOutAt: data.checkOutAt ? data.checkOutAt.toDate().toLocaleString() : null,
          bill: data.bill ?? null,
          status: data.status
        };
      });
      setRecords(list);
    };

    fetchData();
  }, []);

  return (
    <div className="p-8 bg-black text-red-500 font-mincho min-h-screen">
      <h1 className="text-2xl mb-4">チェックイン履歴</h1>
      <table className="w-full text-left border border-red-500">
        <thead>
          <tr>
            <th className="border px-2 py-1">UID</th>
            <th className="border px-2 py-1">テーブル</th>
            <th className="border px-2 py-1">チェックイン</th>
            <th className="border px-2 py-1">チェックアウト</th>
            <th className="border px-2 py-1">料金</th>
            <th className="border px-2 py-1">状態</th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec, i) => (
            <tr key={i}>
              <td className="border px-2 py-1 text-sm">{rec.uid}</td>
              <td className="border px-2 py-1">{rec.tableId}</td>
              <td className="border px-2 py-1">{rec.checkInAt}</td>
              <td className="border px-2 py-1">{rec.checkOutAt || '-'}</td>
              <td className="border px-2 py-1">{rec.bill !== null ? `¥${rec.bill}` : '-'}</td>
              <td className="border px-2 py-1">{rec.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CheckinListPage;
