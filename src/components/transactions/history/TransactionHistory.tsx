```typescript
import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { CategoryCardType } from '../../../types';
import { showSuccessNotification, showErrorNotification } from '../../../utils/notifications';
import { PasswordPrompt } from '../../PasswordPrompt';
import { TransactionHistoryHeader } from './TransactionHistoryHeader';
import { TransactionHistoryList } from './TransactionHistoryList';

interface TransactionHistoryProps {
  category: CategoryCardType;
  isOpen: boolean;
  onClose: () => void;
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  category,
  isOpen,
  onClose
}) => {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any | null>(null);
  const [swipedTransactionId, setSwipedTransactionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'salary' | 'cashless'>('all');
  const [totalAmount, setTotalAmount] = useState(0);
  const [salaryTotal, setSalaryTotal] = useState(0);
  const [filteredTransactions, setFilteredTransactions] = useState<any[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    const q = query(
      collection(db, 'transactions'),
      where('categoryId', '==', category.id),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const transactionsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Вычисляем общую сумму и сумму ЗП
      const total = transactionsData.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const salarySum = transactionsData.reduce((sum, t) => 
        t.isSalary ? sum + Math.abs(t.amount) : sum, 0
      );

      setTransactions(transactionsData);
      setTotalAmount(total);
      setSalaryTotal(salarySum);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [category.id, isOpen]);

  // Фильтрация транзакций
  useEffect(() => {
    let filtered = transactions;

    // Применяем фильтр по типу
    if (selectedFilter === 'salary') {
      filtered = filtered.filter(t => t.isSalary);
    } else if (selectedFilter === 'cashless') {
      filtered = filtered.filter(t => t.isCashless);
    }

    // Применяем поиск
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t =>
        t.description.toLowerCase().includes(query) ||
        t.fromUser.toLowerCase().includes(query) ||
        t.toUser.toLowerCase().includes(query) ||
        Math.abs(t.amount).toString().includes(query)
      );
    }

    setFilteredTransactions(filtered);
  }, [transactions, selectedFilter, searchQuery]);
  const handleDelete = async (isAuthenticated: boolean) => {
    if (!isAuthenticated || !selectedTransaction) {
      setShowPasswordPrompt(false);
      setSelectedTransaction(null);
      return;
    }

    try {
      const batch = writeBatch(db);
      
      // Delete the transaction
      const transactionRef = doc(db, 'transactions', selectedTransaction.id);
      batch.delete(transactionRef);

      // Find and delete the related transaction
      const relatedTransactionsQuery = query(
        collection(db, 'transactions'),
        where('relatedTransactionId', '==', selectedTransaction.id)
      );
      
      const relatedTransactionsSnapshot = await getDocs(relatedTransactionsQuery);
      relatedTransactionsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      showSuccessNotification('Операция успешно удалена');
    } catch (error) {
      console.error('Error deleting transaction:', error);
      showErrorNotification('Ошибка при удалении операции');
    } finally {
      setShowPasswordPrompt(false);
      setSelectedTransaction(null);
      setSwipedTransactionId(null);
    }
  };

  const handleDeleteClick = (transaction: any) => {
    setSelectedTransaction(transaction);
    setShowPasswordPrompt(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full mx-4" style={{ maxHeight: '90vh' }}>
        <TransactionHistoryHeader
          title={category.title}
          totalAmount={totalAmount}
          salaryTotal={salaryTotal}
          onClose={onClose}
          onSearch={setSearchQuery}
          onFilterChange={setSelectedFilter}
          selectedFilter={selectedFilter}
        />

        <div className="overflow-auto" style={{ maxHeight: 'calc(90vh - 73px)' }}>
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
            </div>
          ) : (
            <TransactionHistoryList
              transactions={filteredTransactions}
              swipedTransactionId={swipedTransactionId}
              setSwipedTransactionId={setSwipedTransactionId}
              onDeleteClick={handleDeleteClick}
            />
          )}
        </div>
      </div>
      
      {showPasswordPrompt && (
        <PasswordPrompt
          isOpen={showPasswordPrompt}
          onClose={() => {
            setShowPasswordPrompt(false);
            setSelectedTransaction(null);
          }}
          onSuccess={() => handleDelete(true)}
        />
      )}
    </div>
  );
};
```