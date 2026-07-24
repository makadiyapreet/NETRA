interface RoleSwitcherProps {
  role: 'Analyst' | 'Admin';
  onToggle: () => void;
}

export default function RoleSwitcher({ role, onToggle }: RoleSwitcherProps) {
  return (
    <div className="role-switcher">
      <label>Role:</label>
      <div
        className={`role-toggle ${role === 'Admin' ? 'admin' : ''}`}
        onClick={onToggle}
      >
        <div className="role-toggle-knob" />
      </div>
      <span className={`role-name ${role.toLowerCase()}`}>{role}</span>
    </div>
  );
}
