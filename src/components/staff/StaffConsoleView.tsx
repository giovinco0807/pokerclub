
import React, { useState } from 'react';
import StaffAttendancePanel from './StaffAttendancePanel';
import StaffOrderManagementPanel from './StaffOrderManagementPanel';
import StaffUserManagementPanel from './StaffUserManagementPanel'; // Placeholder
import Button from '../common/Button';

type StaffPanelView = 'attendance' | 'orders' | 'users';

const StaffConsoleView: React.FC = () => {
  const [activePanel, setActivePanel] = useState<StaffPanelView>('attendance');

  const renderPanel = () => {
    switch (activePanel) {
      case 'attendance':
        return <StaffAttendancePanel />;
      case 'orders':
        return <StaffOrderManagementPanel />;
      case 'users':
        return <StaffUserManagementPanel />; // Placeholder for now
      default:
        return <StaffAttendancePanel />;
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-primary font-condensed">スタッフコンソール</h2>
      <div className="flex space-x-2 mb-6 pb-4 border-b border-neutral-light">
        <Button 
            variant={activePanel === 'attendance' ? 'primary' : 'ghost'} 
            onClick={() => setActivePanel('attendance')}>
            入退店・チップ管理
        </Button>
        <Button 
            variant={activePanel === 'orders' ? 'primary' : 'ghost'} 
            onClick={() => setActivePanel('orders')}>
            注文管理
        </Button>
        {/* <Button 
            variant={activePanel === 'users' ? 'primary' : 'ghost'} 
            onClick={() => setActivePanel('users')}>
            ユーザー管理
        </Button> */}
      </div>
      <div>
        {renderPanel()}
      </div>
    </div>
  );
};

export default StaffConsoleView;