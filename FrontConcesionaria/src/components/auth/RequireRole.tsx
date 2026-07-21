import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

interface RequireRoleProps {
    children: React.ReactNode;
    allowedRoles: string[];
}

const RequireRole = ({ children, allowedRoles }: RequireRoleProps) => {
    const { user, isAuthenticated } = useAuthStore();
    const location = useLocation();

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    const hasRequiredRole = user?.roles.some(role => allowedRoles.includes(role));

    if (!hasRequiredRole) {
        return <Navigate to="/403" replace />;
    }

    return <>{children}</>;
};

export default RequireRole;
