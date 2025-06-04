// src/pages/AdminUserManagementPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, doc, updateDoc, deleteDoc, where, orderBy, limit, startAfter, getDocs, Timestamp } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { getFunctions } from 'firebase/functions';
const functions = getFunctions();
import { UserWithId } from '../types';
import { httpsCallable } from 'firebase/functions';
import AdminLayout from '../components/admin/AdminLayout';
import UserDetailsModal from '../components/admin/UserDetailsModal';
import ConfirmationModal from '../components/common/ConfirmationModal';
import { format } from 'date-fns';
import { AiOutlineSearch, AiOutlineCloseCircle, AiOutlineLoading } from 'react-icons/ai';
import { StatusBadge } from '../components/admin/UserDetailsModal';


// formatTimestampのヘルパー関数（再利用のためここに定義）
const formatTimestamp = (timestamp: Timestamp | Date | undefined | null, includeSeconds: boolean = false): string => {
  if (!timestamp) return 'N/A';
  let date: Date;
  if (timestamp instanceof Timestamp) {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    return 'Invalid Date';
  }
  const formatStr = `yyyy/MM/dd HH:mm${includeSeconds ? ':ss' : ''}`;
  return format(date, formatStr);
};

const AdminUserManagementPage: React.FC = () => {
  const [users, setUsers] = useState<UserWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserWithId | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserWithId | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterApproved, setFilterApproved] = useState<boolean | null>(null);
  const [filterCheckedIn, setFilterCheckedIn] = useState<boolean | null>(null);
  const [filterStaff, setFilterStaff] = useState<boolean | null>(null);

  // ページネーション用
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const usersPerPage = 20;

  const fetchUsersWithFilters = useCallback(async (isLoadMore: boolean = false) => {
    setError(null);
    if (!isLoadMore) {
      setLoading(true);
      setUsers([]);
      setLastVisible(null);
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const usersColRef = collection(db, 'users');
      let qry = query(usersColRef);

      // デバッグ用のログを追加
      console.log('Query Filters:');
      console.log('  filterApproved:', filterApproved);
      console.log('  filterCheckedIn:', filterCheckedIn);
      console.log('  filterStaff:', filterStaff);
      console.log('  searchQuery:', searchQuery);


      if (filterApproved !== null) {
        // filterApprovedがnullでない場合のみwhere句を適用
        qry = query(qry, where('approved', '==', filterApproved));
      }

      if (filterCheckedIn !== null) {
        qry = query(qry, where('isCheckedIn', '==', filterCheckedIn));
      }

      let applyClientSideStaffFilter = false;
      if (filterStaff !== null) {
          if (filterStaff) {
              // スタッフのみ表示 (isStaffがtrueのユーザーをFirestoreで直接絞り込む)
              qry = query(qry, where('isStaff', '==', true));
          } else {
              // 一般ユーザーのみ表示 (isStaffがtrueでないユーザー)。
              // Firestoreで '!=' や 'not-in' は使えないため、
              // 全件取得後にクライアントサイドでフィルタリングを行う。
              applyClientSideStaffFilter = true;
          }
      }

      // orderByとlimitは常に適用
      qry = query(qry, orderBy('createdAt', 'desc'), limit(usersPerPage));

      if (isLoadMore && lastVisible) {
        qry = query(qry, startAfter(lastVisible));
      }

      const documentSnapshots = await getDocs(qry);

      // 取得したドキュメント数とデータ内容のログを追加
      console.log('Fetched document count:', documentSnapshots.docs.length);
      // documentSnapshots.docs.forEach(doc => console.log('  Fetched user:', doc.id, doc.data()));


      let fetchedUsers: UserWithId[] = documentSnapshots.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as UserWithId));

      // クライアントサイドでの最終フィルタリング
      let finalUsers = fetchedUsers;

      const searchQueryLower = searchQuery.trim().toLowerCase();
      if (searchQueryLower) {
        finalUsers = finalUsers.filter(user =>
          user.pokerName?.toLowerCase().includes(searchQueryLower) ||
          user.email.toLowerCase().includes(searchQueryLower) ||
          user.fullName?.toLowerCase().includes(searchQueryLower)
        );
      }

      // スタッフフィルター (isStaffがfalseの場合のクライアントサイドフィルタリング)
      if (applyClientSideStaffFilter) {
          finalUsers = finalUsers.filter(user => !user.isStaff);
      }

      // 最終的な表示ユーザー数のログを追加
      console.log('Final displayed user count:', finalUsers.length);

      if (isLoadMore) {
        setUsers(prev => [...prev, ...finalUsers]);
      } else {
        setUsers(finalUsers);
      }

      setLastVisible(documentSnapshots.docs[documentSnapshots.docs.length - 1]);
      setHasMore(documentSnapshots.docs.length === usersPerPage);

    } catch (err) {
      console.error("ユーザーデータの取得に失敗しました:", err);
      setError("ユーザーデータの取得に失敗しました。");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [searchQuery, filterApproved, filterCheckedIn, filterStaff, lastVisible]);


  useEffect(() => {
    fetchUsersWithFilters(false);
  }, [searchQuery, filterApproved, filterCheckedIn, filterStaff, fetchUsersWithFilters]);


  const handleLoadMore = () => {
    if (hasMore) {
      fetchUsersWithFilters(true);
    }
  };


  const handleViewDetails = (user: UserWithId) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedUser(null);
    fetchUsersWithFilters(false);
  };

  const handleApproveUser = async (userId: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { approved: true, updatedAt: Timestamp.now() });
      setSuccessMessage("ユーザーを承認しました！");
    } catch (error: any) {
      console.error("ユーザー承認に失敗しました:", error);
      setErrorMessage(`ユーザー承認に失敗しました: ${error.message}`);
    } finally {
        fetchUsersWithFilters(false);
    }
  };

  const handleUnapproveUser = async (userId: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { approved: false, updatedAt: Timestamp.now() });
      setSuccessMessage("ユーザーの承認を取り消しました！");
    } catch (error: any) {
      console.error("ユーザー承認取り消しに失敗しました:", error);
      setErrorMessage(`ユーザー承認取り消しに失敗しました: ${error.message}`);
    } finally {
        fetchUsersWithFilters(false);
    }
  };


  const handleDeleteUser = (user: UserWithId) => {
    setUserToDelete(user);
    setIsConfirmModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    setError(null);
    try {
      await deleteDoc(doc(db, 'users', userToDelete.id));

      const deleteUserFn = httpsCallable<{ uid: string }, { success: boolean; message: string }>(functions, 'deleteUserByAdmin');
      const result = await deleteUserFn({ uid: userToDelete.id });

      if (!result.data.success) {
        throw new Error(result.data.message || "Firebase Authユーザーの削除に失敗しました。");
      }

      setUsers(prev => prev.filter(u => u.id !== userToDelete.id));
      setSuccessMessage("ユーザーを完全に削除しました。");
    } catch (err: any) {
      console.error("ユーザーの削除に失敗しました:", err);
      setErrorMessage(`ユーザーの削除に失敗しました: ${err.message}`);
    } finally {
      setIsConfirmModalOpen(false);
      setUserToDelete(null);
      fetchUsersWithFilters(false);
    }
  };

  const cancelDelete = () => {
    setIsConfirmModalOpen(false);
    setUserToDelete(null);
  };


  const setSuccessMessage = (message: string) => {
    const adminMessageElement = document.getElementById('admin-message');
    if (adminMessageElement) {
      adminMessageElement.innerText = message;
      adminMessageElement.classList.remove('bg-red-500');
      adminMessageElement.classList.add('bg-green-500');
      adminMessageElement.classList.remove('hidden');
      setTimeout(() => {
        adminMessageElement.classList.add('hidden');
      }, 3000);
    }
  };

  const setErrorMessage = (message: string) => {
    const adminMessageElement = document.getElementById('admin-message');
    if (adminMessageElement) {
      adminMessageElement.innerText = message;
      adminMessageElement.classList.remove('bg-green-500');
      adminMessageElement.classList.add('bg-red-500');
      adminMessageElement.classList.remove('hidden');
      setTimeout(() => {
        adminMessageElement.classList.add('hidden');
      }, 5000);
    }
  };


  return (
    <AdminLayout>
      <h1 className="text-3xl font-bold text-neutral-lightest mb-6">ユーザー管理</h1>

      <div id="admin-message" className="hidden p-3 mb-4 rounded-md text-white font-semibold"></div>

      {error && <div className="bg-red-600 p-3 mb-4 rounded-md text-white">{error}</div>}

      {/* フィルターと検索 */}
      <div className="bg-neutral-darker p-4 rounded-lg shadow-md mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="relative">
            <input
              type="text"
              placeholder="ポーカーネーム, メール, 氏名で検索..."
              className="w-full p-2 pl-10 bg-neutral-dark text-neutral-lightest border border-neutral-600 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <AiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={20} />
            {searchQuery && (
              <AiOutlineCloseCircle
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 cursor-pointer hover:text-neutral-200"
                size={20}
                onClick={() => setSearchQuery('')}
              />
            )}
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-neutral-light">承認状態:</label>
            <select
              className="p-2 bg-neutral-dark text-neutral-lightest border border-neutral-600 rounded-md"
              value={filterApproved === true ? 'approved' : filterApproved === false ? 'unapproved' : 'all'}
              onChange={(e) => {
                if (e.target.value === 'all') setFilterApproved(null);
                else setFilterApproved(e.target.value === 'approved');
              }}
            >
              <option value="all">全て</option>
              <option value="approved">承認済</option>
              <option value="unapproved">未承認</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-neutral-light">チェックイン状態:</label>
            <select
              className="p-2 bg-neutral-dark text-neutral-lightest border border-neutral-600 rounded-md"
              value={filterCheckedIn === true ? 'checkedin' : filterCheckedIn === false ? 'checkedout' : 'all'}
              onChange={(e) => {
                if (e.target.value === 'all') setFilterCheckedIn(null);
                else setFilterCheckedIn(e.target.value === 'checkedin');
              }}
            >
              <option value="all">全て</option>
              <option value="checkedin">チェックイン中</option>
              <option value="checkedout">チェックアウト済</option>
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <label className="text-neutral-light">権限:</label>
            <select
              className="p-2 bg-neutral-dark text-neutral-lightest border border-neutral-600 rounded-md"
              value={filterStaff === true ? 'staff' : filterStaff === false ? 'general' : 'all'}
              onChange={(e) => {
                if (e.target.value === 'all') setFilterStaff(null);
                else setFilterStaff(e.target.value === 'staff');
              }}
            >
              <option value="all">全て</option>
              <option value="staff">スタッフ</option>
              <option value="general">一般</option>
            </select>
          </div>
        </div>
      </div>


      {loading ? (
        <div className="text-center text-neutral-light">
          <AiOutlineLoading className="inline-block animate-spin mr-2" size={24} />
          ユーザーを読み込み中...
        </div>
      ) : (
        <>
          <div className="overflow-x-auto bg-neutral-darker rounded-lg shadow">
            <table className="min-w-full divide-y divide-neutral-700">
              <thead className="bg-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">ポーカーネーム</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">メール</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">現在のチップ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">会計残高</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">状態</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">登録日</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">アクション</th>
                </tr>
              </thead>
              <tbody className="bg-neutral-darker divide-y divide-neutral-700">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-4 text-center text-neutral-400">
                      条件に一致するユーザーが見つかりません。
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-neutral-700 transition-colors duration-150">
                      <td className="px-4 py-3 whitespace-nowrap text-neutral-lightest">
                        {user.pokerName || '未設定'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-neutral-light">
                        {user.email}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-neutral-light">
                        {user.chips.toLocaleString()} P
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-neutral-light">
                        {user.bill.toLocaleString()} 円
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col space-y-1">
                          <StatusBadge color={user.approved ? "green" : "yellow"} text={user.approved ? "承認済" : "未承認"} />
                          <StatusBadge color={user.isCheckedIn ? "sky" : "slate"} text={user.isCheckedIn ? "チェックイン中" : "チェックアウト済"} />
                          {user.isStaff && <StatusBadge color="purple" text="スタッフ" />}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-neutral-light text-sm">
                        {formatTimestamp(user.createdAt)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleViewDetails(user)}
                          className="text-blue-500 hover:text-blue-700 mr-3"
                        >
                          詳細/編集
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user)}
                          className="text-red-500 hover:text-red-700"
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* ページネーションボタン */}
          {hasMore && (
            <div className="text-center mt-6">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingMore ? (
                  <>
                    <AiOutlineLoading className="inline-block animate-spin mr-2" size={18} />
                    読み込み中...
                  </>
                ) : (
                  'さらに読み込む'
                )}
              </button>
            </div>
          )}
        </>
      )}

      {selectedUser && (
        <UserDetailsModal
          user={selectedUser}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onApprove={handleApproveUser}
          onUnapprove={handleUnapproveUser}
          onUserUpdateSuccess={setSuccessMessage}
          onUserUpdateError={setErrorMessage}
        />
      )}

      <ConfirmationModal
        isOpen={isConfirmModalOpen}
        onClose={cancelDelete}
        onConfirm={confirmDelete}
        title="ユーザー削除の確認"
        message={`ユーザー ${userToDelete?.pokerName || userToDelete?.email} を本当に削除しますか？この操作は元に戻せません。`}
        confirmButtonText="削除する"
        cancelButtonText="キャンセル"
      />
    </AdminLayout>
  );
};

export default AdminUserManagementPage;